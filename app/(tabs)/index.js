// 將回覆標記為已讀
async function markAsRead(replyId) {
  if (!replyId) return;
  const replyRef = doc(collection(db, 'replies'), replyId);
  await setDoc(replyRef, { isRead: true }, { merge: true });
}
console.log('NEW CODE LOADED');
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, SafeAreaView, TouchableOpacity, Modal, Image, Animated, Dimensions, Vibration, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';

import { getDeviceId } from '../../utils/getDeviceId';
import { getUserId } from '../../utils/getUserId';
import MessageModal from '../../components/MessageModal';
import FABDialog from '../../components/FABDialog';
import { db, storage } from '../../config/firebaseConfig';
import { useMoney } from '../../context/moneyContext';
import { doc, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, where, updateDoc, setDoc, getDoc, runTransaction, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, getStorage } from 'firebase/storage';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = 300;

// 幫指定 deviceId 加金幣
async function addMoneyToDevice(deviceId, amount) {
  if (!deviceId) return;
  const profileRef = doc(collection(db, 'profiles'), deviceId);
  const profileSnap = await getDoc(profileRef);
  if (!profileSnap.exists()) {
    await setDoc(profileRef, { money: amount }, { merge: true });
  } else {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(profileRef);
      let oldMoney = 0;
      if (snap.exists()) {
        const data = snap.data();
        oldMoney = typeof data.money === 'number' ? data.money : 0;
      }
      transaction.set(profileRef, { money: oldMoney + amount }, { merge: true });
    });
  }
}

export default function HomePage() {
  // 監聽自己收到的回覆，若有 showHeartToast 則顯示提示
  useEffect(() => {
    console.log('[debug] useEffect deviceId:', deviceId);
    if (!deviceId) return;
    let timeoutId = null;
    const q = query(
      collection(db, 'replies'),
      where('fromDeviceId', '==', deviceId),
      where('showHeartToast', '==', true)
    );
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      console.log('[debug] onSnapshot replies triggered, size:', querySnapshot.size);
      querySnapshot.forEach(async (docSnap) => {
        const data = docSnap.data();
        console.log('[debug] docSnap.id:', docSnap.id, 'data:', data);
        // 先更新金幣數量
        if (typeof earn === 'function') {
          earn(0); // 觸發金幣 context 更新（如果有必要，可改成 earn(0) 或直接觸發刷新）
        }
        // 再顯示提示
        setTimeout(() => {
          setReplySentInfo('收到愛心 獲得5枚回音幣');
          console.log('[debug] setReplySentInfo 後');
          if (timeoutId) clearTimeout(timeoutId);
          timeoutId = setTimeout(() => setReplySentInfo(null), 2000);
        }, 200); // 稍微延遲，確保金幣 UI 先刷新
        // 清除 showHeartToast 標記，避免重複彈出
        await setDoc(doc(collection(db, 'replies'), docSnap.id), { showHeartToast: false }, { merge: true });
        console.log('[debug] 已清除 showHeartToast:', docSnap.id);
      });
    });
    return () => {
      unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [deviceId]);
  const router = useRouter();
  const { money, earn } = useMoney();
  const [favoriteMap, setFavoriteMap] = useState({});
  const [heartLoading, setHeartLoading] = useState(false);
  const [text, setText] = useState('');
  const [dialogVisible, setDialogVisible] = useState(false);
  const [messages, setMessages] = useState([]);
  const [envelopeVisible, setEnvelopeVisible] = useState(false);
  const [msgModalVisible, setMsgModalVisible] = useState(false);
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [replies, setReplies] = useState([]);
  const [selectedReply, setSelectedReply] = useState(null);
  const [originalMessage, setOriginalMessage] = useState(null);
  const [replyDetailVisible, setReplyDetailVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(CARD_WIDTH)).current;
  const shakeAnims = useRef({});
  const [avatarMap, setAvatarMap] = useState({});
  const fetchAvatars = useCallback(async () => {
    const map = {};
    for (const msg of messages) {
      const key = msg.deviceId;
      if (key) {
        try {
          const docRef = doc(collection(db, 'profiles'), key);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.avatarUrl) map[key] = data.avatarUrl;
          }
        } catch {}
      }
    }
    setAvatarMap(map);
  }, [messages]);

  useEffect(() => { getDeviceId().then(setDeviceId); }, []);

  // 監聽 profiles 以即時更新頭貼
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'profiles'), () => {
      fetchAvatars();
    });
    return () => unsubscribe();
  }, [fetchAvatars]);
  useEffect(() => {
    const q = query(collection(db, 'chat'), where('isReplied', '==', false), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const data = [];
      querySnapshot.forEach((doc) => { data.push({ ...doc.data(), id: doc.id }); });
      setMessages(data);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!deviceId) return;
    const qMsg = query(collection(db, 'chat'), where('deviceId', '==', deviceId));
    const unsubscribeMsg = onSnapshot(qMsg, (querySnapshot) => {
      const myMsgIds = [];
      querySnapshot.forEach((doc) => { myMsgIds.push(doc.id); });
      if (myMsgIds.length === 0) { setReplies([]); return; }
      const batchSize = 10;
      const batches = [];
      for (let i = 0; i < myMsgIds.length; i += batchSize) { batches.push(myMsgIds.slice(i, i + batchSize)); }
      const unsubscribes = [];
      let allReplies = [];
      let favMap = {};
      batches.forEach((batch) => {
        const qReply = query(collection(db, 'replies'), where('messageId', 'in', batch), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(qReply, (querySnapshot) => {
          const data = [];
          querySnapshot.forEach((doc) => {
            const d = { ...doc.data(), id: doc.id };
            data.push(d);
            if (d.likedBy && Array.isArray(d.likedBy) && deviceId) {
              favMap[d.id] = d.likedBy.includes(deviceId);
            } else {
              favMap[d.id] = false;
            }
          });
          allReplies = allReplies.filter(r => !batch.includes(r.messageId)).concat(data);
          setReplies([...allReplies].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
          setFavoriteMap(favMap);
        });
        unsubscribes.push(unsub);
      });
      return () => unsubscribes.forEach(unsub => unsub());
    });
    return () => unsubscribeMsg();
  }, [deviceId]);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: replyDetailVisible ? 0 : CARD_WIDTH,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [replyDetailVisible]);


  const handleSend = async () => {
    if (text.trim().length > 0) {
      try {
        const userId = await getUserId();
        await addDoc(collection(db, 'chat'), {
          content: text,
          createdAt: serverTimestamp(),
          deviceId: deviceId,
          userId: userId,
          isReplied: false,
        });
        setText('');
        setDialogVisible(false);
        earn(10);
        setReplySentInfo('已發文 獲得10枚回音幣');
        setTimeout(() => setReplySentInfo(null), 2000);
      } catch (error) {
        console.error('傳送失敗:', error);
      }
    }
  };

  const [replySentInfo, setReplySentInfo] = useState(null);
  const handleReply = async (replyText, rawImage) => {
    const activeStorage = storage || getStorage();
    let imageUri = null;
    if (rawImage) {
      imageUri = typeof rawImage === 'object' ? rawImage.uri : rawImage;
    }
    if (!selectedMsg || !deviceId) return;
    try {
      let firebaseUrl = null;
      if (imageUri && typeof imageUri === 'string' && imageUri.startsWith('file')) {
        const blob = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.onload = () => resolve(xhr.response);
          xhr.onerror = (e) => reject(new TypeError('網路請求失敗'));
          xhr.responseType = 'blob';
          xhr.open('GET', imageUri, true);
          xhr.send(null);
        });
        const filename = `replies/${deviceId}_${Date.now()}.jpg`;
        const storageRef = ref(activeStorage, filename);
        const snapshot = await uploadBytes(storageRef, blob);
        firebaseUrl = await getDownloadURL(snapshot.ref);
      } else if (imageUri && imageUri.startsWith('http')) {
        firebaseUrl = imageUri;
      }
      const fromUserId = await getUserId();
      await addDoc(collection(db, 'replies'), {
        messageId: selectedMsg.id,
        toDeviceId: selectedMsg.deviceId,
        fromDeviceId: deviceId,
        fromUserId: fromUserId,
        replyText: replyText || '',
        imageUri: firebaseUrl,
        createdAt: serverTimestamp(),
        isRead: false,
      });
      // 標記 chat 為已被回覆
      const chatRef = doc(collection(db, 'chat'), selectedMsg.id);
      await setDoc(chatRef, { isReplied: true }, { merge: true });
      setMsgModalVisible(false);
      setSelectedMsg(null);
      setReplySentInfo(`已回覆 獲得5枚回音幣`);
      setTimeout(() => setReplySentInfo(null), 2000);
      earn(5);
    } catch (e) {
      alert('傳送失敗: ' + e.message);
    }
  };

  // Expo Router: useFocusEffect 替換
  useEffect(() => {
    if (!deviceId) return;

    // 1. 監聽自己的訊息
    const qMsg = query(collection(db, 'chat'), where('deviceId', '==', deviceId));
    const unsubscribeMsg = onSnapshot(qMsg, (querySnapshot) => {
      const myMsgIds = [];
      querySnapshot.forEach((doc) => { myMsgIds.push(doc.id); });

      if (myMsgIds.length === 0) {
        setReplies([]);
        return;
      }

      // 2. 分批處理迴響 (Firebase 'in' 限制為 10 個)
      const batchSize = 10;
      const batches = [];
      for (let i = 0; i < myMsgIds.length; i += batchSize) {
        batches.push(myMsgIds.slice(i, i + batchSize));
      }

      const unsubscribes = [];
      let allReplies = [];
      let favMap = { ...favoriteMap };

      batches.forEach((batch) => {
        const qReply = query(
          collection(db, 'replies'),
          where('messageId', 'in', batch),
          orderBy('createdAt', 'desc')
        );

        const unsub = onSnapshot(qReply, (querySnapshot) => {
          const data = [];
          querySnapshot.forEach((doc) => {
            const d = { ...doc.data(), id: doc.id };
            data.push(d);
            // 處理收藏狀態
            favMap[d.id] = d.likedBy?.includes(deviceId) || false;
          });

          allReplies = allReplies.filter(r => !batch.includes(r.messageId)).concat(data);
          
          // 更新狀態並排序
          setReplies([...allReplies].sort((a, b) => 
            (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
          ));
          setFavoriteMap(favMap);
        });
        unsubscribes.push(unsub);
      });

      return () => unsubscribes.forEach(unsub => unsub());
    });

    return () => unsubscribeMsg();
  }, [deviceId]);

  // --- 動畫邏輯 ---
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: replyDetailVisible ? 0 : CARD_WIDTH,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [replyDetailVisible]);

  // --- 計算屬性 ---
  const hasUnreadReplies = replies.some(r => r.isRead === false);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Firebase 即時留言板</Text>
      <Text style={{textAlign: 'center', color: '#ffb300', fontWeight: 'bold', fontSize: 18, marginBottom: 8}}>金幣：{money}</Text>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isMine = item.deviceId === deviceId;
          const avatarUrl = avatarMap[item.deviceId];
          if (isMine) {
            let anim = shakeAnims.current[item.id];
            if (!anim) {
              anim = new Animated.Value(0);
              shakeAnims.current[item.id] = anim;
            }
            return (
              <Animated.View
                style={[styles.msgBox, { flexDirection: 'row', alignItems: 'center',
                  transform: [
                    {
                      translateX: anim.interpolate({
                        inputRange: [-1, 1],
                        outputRange: [-10, 10],
                      }),
                    },
                  ],
                }]}
              >
                <Image source={avatarUrl ? { uri: avatarUrl } : require('../../assets/avatar-placeholder.png')} style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: '#eee' }} />
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    let anim = shakeAnims.current[item.id];
                    Animated.sequence([
                      Animated.timing(anim, { toValue: -1, duration: 50, useNativeDriver: true }),
                      Animated.timing(anim, { toValue: 1, duration: 50, useNativeDriver: true }),
                      Animated.timing(anim, { toValue: -1, duration: 50, useNativeDriver: true }),
                      Animated.timing(anim, { toValue: 1, duration: 50, useNativeDriver: true }),
                      Animated.timing(anim, { toValue: 0, duration: 50, useNativeDriver: true }),
                    ]).start();
                  }}
                >
                  <Text style={{ color: '#888', fontSize: 12, marginBottom: 2 }}>You</Text>
                  <Text style={[styles.msgText, { color: '#aaa', maxWidth: 300 }]} numberOfLines={1} ellipsizeMode="tail">{item.content}</Text>
                </TouchableOpacity>
              </Animated.View>
            );
          } else {
            return (
              <TouchableOpacity
                style={[styles.msgBox, { flexDirection: 'row', alignItems: 'center' }]}
                onPress={() => {
                  setSelectedMsg(item);
                  setMsgModalVisible(true);
                }}
                activeOpacity={0.7}
              >
                <Image source={avatarUrl ? { uri: avatarUrl } : require('../../assets/avatar-placeholder.png')} style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: '#eee' }} />
                <View>
                  <Text style={{ color: '#888', fontSize: 12, marginBottom: 2 }}>
                    {item.userId || item.deviceId || 'Unknown'}
                  </Text>
                  <Text style={[styles.msgText, {maxWidth: 300}]} numberOfLines={1} ellipsizeMode="tail">{item.content}</Text>
                </View>
              </TouchableOpacity>
            );
          }
        }}
      />
      <MessageModal
        visible={msgModalVisible}
        onClose={() => setMsgModalVisible(false)}
        message={selectedMsg?.content}
        onReply={(text, img) => {
          handleReply(text, img);
        }}
      />
      {replySentInfo && (
        <View style={{ position: 'absolute', top: 80, alignSelf: 'center', backgroundColor: '#4630EB', padding: 12, borderRadius: 20, zIndex: 100 }}>
          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>{replySentInfo}</Text>
        </View>
      )}
      <View style={styles.fabContainer}>
        <View>
          <TouchableOpacity style={styles.envelopeFab} onPress={() => setEnvelopeVisible(true)}>
            <Text style={styles.envelopeIcon}>✉️</Text>
            {hasUnreadReplies && (
              <View style={styles.redDot} />
            )}
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.fab} onPress={() => setDialogVisible(true)}>
          <Text style={styles.fabIcon}>＋</Text>
        </TouchableOpacity>
      </View>
      <Modal visible={envelopeVisible} transparent animationType="fade" onRequestClose={() => setEnvelopeVisible(false)}>
        <View style={styles.overlay}>
          <View style={[styles.envelopeDialog, { overflow: 'hidden', height: 400 }]}>            
            <Text style={styles.envelopeTitle}>收到的留言回覆</Text>
            <View style={{ height: 250, width: '100%' }}>
              <FlatList
                data={replies}
                keyExtractor={item => item.id}
                ListEmptyComponent={<Text style={{ color: '#888', marginVertical: 10, textAlign: 'center', alignSelf: 'center' }}>目前沒有收到回覆</Text>}
                renderItem={({ item }) => {
                  const fontWeight = item.isRead ? '400' : 'bold';
                  return (
                    <TouchableOpacity
                      style={styles.replyItem}
                      onPress={async () => {
                        setSelectedReply(item);
                        setReplyDetailVisible(true);
                        // 取得原留言內容
                        if (item.messageId) {
                          const msgRef = doc(collection(db, 'chat'), item.messageId);
                          const msgSnap = await getDoc(msgRef);
                          if (msgSnap.exists()) {
                            setOriginalMessage(msgSnap.data().content || '');
                          } else {
                            setOriginalMessage('（原留言已刪除）');
                          }
                        } else {
                          setOriginalMessage('');
                        }
                        if (!item.isRead) await markAsRead(item.id);
                      }}
                    >
                      <Text style={[styles.replyLinkText, { fontWeight }]} numberOfLines={1}>
                        {(() => {
                          const name = item.fromUserId || item.fromDeviceId || 'Unknown';
                          return (name.length > 10 ? name.slice(0, 8) + '...' : name) + ': ' + item.replyText;
                        })()}
                      </Text>
                      {item.imageUri && <Image source={{ uri: item.imageUri }} style={styles.replyThumb} />}
                    </TouchableOpacity>
                  );
                }}
                style={{ flex: 1, width: '100%' }}
              />
            </View>
            <TouchableOpacity onPress={() => setEnvelopeVisible(false)} style={styles.closeBtn}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>關閉</Text>
            </TouchableOpacity>
            <Animated.View style={[
              styles.detailSlide,
              { transform: [{ translateX: slideAnim }], zIndex: 20 }
            ]}>
              <TouchableOpacity onPress={() => setReplyDetailVisible(false)} style={styles.backBtn}>
                <Text style={styles.backBtnText}>←</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ position: 'absolute', right: 15, top: 15, zIndex: 10, opacity: favoriteMap[selectedReply?.id] ? 0.7 : 1 }}
                disabled={favoriteMap[selectedReply?.id] || heartLoading || !selectedReply}
                onPress={async () => {
                  if (favoriteMap[selectedReply?.id] || heartLoading || !selectedReply) return;
                  setHeartLoading(true);
                  try {
                    const replyRef = doc(collection(db, 'replies'), selectedReply.id);
                    // 1. 先取得原本的 likedBy
                    const replySnap = await getDoc(replyRef);
                    let likedBy = [];
                    if (replySnap.exists()) {
                      const replyData = replySnap.data();
                      likedBy = Array.isArray(replyData.likedBy) ? replyData.likedBy : [];
                      const fromDeviceId = replyData.fromDeviceId;
                      if (fromDeviceId) await addMoneyToDevice(fromDeviceId, 5);
                    }
                    // 2. 把 deviceId 加入 likedBy
                    if (!likedBy.includes(deviceId)) likedBy.push(deviceId);
                    await setDoc(replyRef, { isRewardGiven: true, showHeartToast: true, likedBy }, { merge: true });
                  } catch {}
                  setFavoriteMap(fav => ({ ...fav, [selectedReply.id]: true }));
                  setReplySentInfo('發送愛心 獲得2枚回音幣');
                  setTimeout(() => setReplySentInfo(null), 2000);
                  earn(2);
                  setHeartLoading(false);
                }}

              >
                <Text style={{ fontSize: 26, color: '#e74c3c' }}>
                  {favoriteMap[selectedReply?.id] ? '♥' : '♡'}
                </Text>
              </TouchableOpacity>
              <View style={{ marginTop: 20, alignItems: 'center', width: '100%', flex: 1 }}>
                <ScrollView contentContainerStyle={{ alignItems: 'center', paddingBottom: 20 }} style={{ width: '100%' }}>
                  <Text style={styles.detailLabel}>回覆來自：</Text>
                  <Text style={styles.detailText}>{selectedReply?.fromUserId || '匿名'}</Text>
                  <Text style={styles.detailLabel}>原留言：</Text>
                  <Text style={styles.detailText}>{originalMessage ?? '...'}</Text>
                  <Text style={styles.detailLabel}>回覆內容：</Text>
                  <Text style={styles.detailText}>{selectedReply?.replyText}</Text>
                  {selectedReply?.imageUri && <Image source={{ uri: selectedReply.imageUri }} style={styles.detailImage} />}
                </ScrollView>
              </View>
            </Animated.View>
          </View>
        </View>
      </Modal>
      <FABDialog visible={dialogVisible} onClose={() => setDialogVisible(false)} text={text} setText={setText} onSend={handleSend} />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingHorizontal: 20 },
  title: { fontSize: 22, fontWeight: 'bold', marginVertical: 20, textAlign: 'center', color: '#333' },
  msgBox: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, borderLeftWidth: 4, borderLeftColor: '#4630EB' },
  msgText: { fontSize: 16, color: '#444' },
  fabContainer: { position: 'absolute', right: 24, bottom: 36, alignItems: 'center' },
  fab: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#4630EB', justifyContent: 'center', alignItems: 'center', elevation: 5 },
  fabIcon: { color: '#fff', fontSize: 36, fontWeight: 'bold' },
  envelopeFab: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#ffb300', justifyContent: 'center', alignItems: 'center', marginBottom: 16, elevation: 5, position: 'relative' },
  redDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'red',
    zIndex: 10,
  },
  envelopeIcon: { fontSize: 30 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  envelopeDialog: { width: CARD_WIDTH, backgroundColor: '#fff', borderRadius: 15, padding: 20, alignItems: 'center', elevation: 10, position: 'relative' },
  envelopeTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#4630EB' },
  replyItem: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  replyLinkText: { flex: 1, color: '#4630EB', fontWeight: '500' },
  replyThumb: { width: 40, height: 40, borderRadius: 4, marginLeft: 10 },
  closeBtn: { marginTop: 15, backgroundColor: '#4630EB', paddingHorizontal: 30, paddingVertical: 10, borderRadius: 20 },
  detailSlide: { 
    position: 'absolute', 
    top: 0, 
    left: 0, 
    width: CARD_WIDTH, 
    height: 400, 
    backgroundColor: '#fff', 
    borderRadius: 15, 
    padding: 20, 
    alignItems: 'center' 
  },
  backBtn: { position: 'absolute', left: 15, top: 15, zIndex: 10 },
  backBtnText: { fontSize: 24, color: '#4630EB', fontWeight: 'bold' },
  detailLabel: { color: '#4630EB', fontWeight: 'bold', marginTop: 10 },
  detailText: { marginVertical: 5, textAlign: 'center' },
  detailImage: { width: 200, height: 150, borderRadius: 10, marginTop: 10 },
});

// Expo Router 頁面元件名稱需為 HomePage
