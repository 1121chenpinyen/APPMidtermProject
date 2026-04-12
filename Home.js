import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getDeviceId } from './getDeviceId';
import { getUserId } from './getUserId';
import { StyleSheet, Text, View, FlatList, SafeAreaView, TouchableOpacity, Modal, Image, Animated, Dimensions, Vibration, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// 1. 引入自定義組件
import MessageModal from './MessageModal';
import FABDialog from './FABDialog';

// 2. 引入 Firebase 配置
import { db, storage } from './firebaseConfig';
import { doc, getDoc, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, where, updateDoc } from 'firebase/firestore';
  // 標記回覆為已讀
  const markAsRead = async (replyId) => {
    try {
      const replyRef = doc(collection(db, 'replies'), replyId);
      await updateDoc(replyRef, { isRead: true });
    } catch (e) {
      // 可選：console.error('標記已讀失敗', e);
    }
  };
import { ref, uploadBytes, getDownloadURL, getStorage } from 'firebase/storage';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = 300; // 定義卡片寬度

import { useFocusEffect } from '@react-navigation/native';

export default function Home() {
  const [text, setText] = useState('');
  const [dialogVisible, setDialogVisible] = useState(false);
  const [messages, setMessages] = useState([]);
  const [envelopeVisible, setEnvelopeVisible] = useState(false);
  const [msgModalVisible, setMsgModalVisible] = useState(false);
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [replies, setReplies] = useState([]);
  const [selectedReply, setSelectedReply] = useState(null);
  const [replyDetailVisible, setReplyDetailVisible] = useState(false);
  
  // 動畫初始值改為卡片寬度 CARD_WIDTH
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

  useFocusEffect(
    useCallback(() => {
      if (messages.length > 0) fetchAvatars();
    }, [messages, fetchAvatars])
  );

  useEffect(() => {
    getDeviceId().then(setDeviceId);
  }, []);

  useEffect(() => {
    const q = query(collection(db, "chat"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const data = [];
      querySnapshot.forEach((doc) => {
        data.push({ ...doc.data(), id: doc.id });
      });
      setMessages(data);
    });
    return () => unsubscribe();
  }, []);

  const handleSend = async () => {
    if (text.trim().length > 0) {
      try {
        const userId = await getUserId();
        await addDoc(collection(db, "chat"), {
          content: text,
          createdAt: serverTimestamp(),
          deviceId: deviceId,
          userId: userId,
        });
        setText('');
        setDialogVisible(false);
      } catch (error) {
        console.error("傳送失敗:", error);
      }
    }
  };

  const [replySentInfo, setReplySentInfo] = useState(null); // 新增狀態
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
      setMsgModalVisible(false);
      setSelectedMsg(null);
      // 顯示已回覆(留言者ID)
      setReplySentInfo(`已回覆${selectedMsg.userId || selectedMsg.deviceId || 'Unknown'}的留言`);
      setTimeout(() => setReplySentInfo(null), 2000);
    } catch (e) {
      alert('傳送失敗: ' + e.message);
    }
  };

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
      batches.forEach((batch) => {
        const qReply = query(collection(db, 'replies'), where('messageId', 'in', batch), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(qReply, (querySnapshot) => {
          const data = [];
          querySnapshot.forEach((doc) => { data.push({ ...doc.data(), id: doc.id }); });
          allReplies = allReplies.filter(r => !batch.includes(r.messageId)).concat(data);
          setReplies([...allReplies].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
        });
        unsubscribes.push(unsub);
      });
      return () => unsubscribes.forEach(unsub => unsub());
    });
    return () => unsubscribeMsg();
  }, [deviceId]);

  // 動畫目標改為 CARD_WIDTH
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: replyDetailVisible ? 0 : CARD_WIDTH,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [replyDetailVisible]);

  // 計算是否有未讀回覆
  const hasUnreadReplies = replies.some(r => r.isRead === false);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Firebase 即時留言板</Text>
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
                <Image source={avatarUrl ? { uri: avatarUrl } : require('./assets/avatar-placeholder.png')} style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: '#eee' }} />
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
                <Image source={avatarUrl ? { uri: avatarUrl } : require('./assets/avatar-placeholder.png')} style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: '#eee' }} />
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

      {/* 回覆送出提示 */}
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

      {/* 修改 3: 重構後的信封 Modal */}
      <Modal visible={envelopeVisible} transparent animationType="fade" onRequestClose={() => setEnvelopeVisible(false)}>
        <View style={styles.overlay}>
          {/* 增加 overflow: 'hidden' 確保內頁滑動時不會超出圓角 */}
          <View style={[styles.envelopeDialog, { overflow: 'hidden', height: 400 }]}>
            
            {/* 信箱列表頁面 (原本的內容) */}
            <Text style={styles.envelopeTitle}>收到的留言回覆</Text>
            <View style={{ height: 250, width: '100%' }}>
              <FlatList
                data={replies}
                keyExtractor={item => item.id}
                ListEmptyComponent={<Text style={{ color: '#888', marginVertical: 10 }}>目前沒有收到回覆</Text>}
                renderItem={({ item }) => {
                  const fontWeight = item.isRead ? '400' : 'bold';
                  return (
                    <TouchableOpacity
                      style={styles.replyItem}
                      onPress={async () => {
                        setSelectedReply(item);
                        setReplyDetailVisible(true);
                        if (!item.isRead) await markAsRead(item.id);
                      }}
                    >
                      <Text style={[styles.replyLinkText, { fontWeight }]} numberOfLines={1}>
                        {/* 優化後的 UserID 顯示 */}
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

            {/* 修改 4: 移入內部的滑入詳情頁 */}
            <Animated.View style={[
              styles.detailSlide,
              { transform: [{ translateX: slideAnim }], zIndex: 20 }
            ]}>
              <TouchableOpacity onPress={() => setReplyDetailVisible(false)} style={styles.backBtn}>
                <Text style={styles.backBtnText}>←</Text>
              </TouchableOpacity>
              <View style={{ marginTop: 20, alignItems: 'center', width: '100%', flex: 1 }}>
                <ScrollView contentContainerStyle={{ alignItems: 'center', paddingBottom: 20 }} style={{ width: '100%' }}>
                  <Text style={styles.detailLabel}>回覆來自：</Text>
                  <Text style={styles.detailText}>{selectedReply?.fromUserId || '匿名'}</Text>
                  <Text style={styles.detailLabel}>原留言：</Text>
                  <Text style={styles.detailText}>{messages.find(m => m.id === selectedReply?.messageId)?.content || '...'}</Text>
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
  // 修改 5: 調整 detailSlide 樣式，使其與卡片完全重合
  detailSlide: { 
    position: 'absolute', 
    top: 0, 
    left: 0, 
    width: CARD_WIDTH, 
    height: 400, // 需與 envelopeDialog 的高度一致
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