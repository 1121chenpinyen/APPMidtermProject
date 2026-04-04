import React, { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { StyleSheet, Text, View, FlatList, SafeAreaView, TouchableOpacity, Modal, Image, Animated, Dimensions, Vibration } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// 1. 引入自定義組件
import MessageModal from './MessageModal';
import FABDialog from './FABDialog';

// 2. 引入 Firebase 配置
import { db, storage } from './firebaseConfig';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, getStorage } from 'firebase/storage'; // 多引入 getStorage 以防萬一

const SCREEN_WIDTH = Dimensions.get('window').width;

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
  const slideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  // 每個自己的留言都獨立一個 shake 動畫（用 useRef 管理，避免 render 階段 setState）
  const shakeAnims = useRef({});

  // 診斷：App 啟動時檢查一次 storage
  useEffect(() => {
    console.log("=== App 啟動檢查 ===");
    console.log("Firebase Storage 實例是否存在:", !!storage);
  }, []);

  // 1. 取得或創建裝置唯一 ID
  useEffect(() => {
    const getOrCreateDeviceId = async () => {
      let id = await AsyncStorage.getItem('deviceId');
      if (!id) {
        const bytes = await Crypto.getRandomBytesAsync(16);
        id = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        await AsyncStorage.setItem('deviceId', id);
      }
      setDeviceId(id);
    };
    getOrCreateDeviceId();
  }, []);

  // 2. 監聽所有主留言
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

  // 3. 傳送新留言 (主留言)
  const handleSend = async () => {
    if (text.trim().length > 0 && deviceId) {
      try {
        await addDoc(collection(db, "chat"), {
          content: text,
          createdAt: serverTimestamp(),
          deviceId: deviceId,
        });
        setText('');
        setDialogVisible(false);
      } catch (error) {
        console.error("傳送失敗:", error);
      }
    }
  };

  // 4. 處理回覆 (核心修復版)
  const handleReply = async (replyText, rawImage) => {
    console.log("--- handleReply 開始執行 ---");
    
    // 🚀 暴力修復邏輯：如果 storage 是空的，嘗試重新抓取
    const activeStorage = storage || getStorage(); 
    
    console.log("Storage 檢查:", !!activeStorage ? "✅ 正常" : "❌ 遺失");

    let imageUri = null;
    if (rawImage) {
      imageUri = typeof rawImage === 'object' ? rawImage.uri : rawImage;
    }

    if (!selectedMsg || !deviceId) return;

    try {
      let firebaseUrl = null;

      // 圖片上傳流程
      if (imageUri && typeof imageUri === 'string' && imageUri.startsWith('file')) {
        console.log("Step 1: 準備上傳本地圖片...");

        const blob = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.onload = () => resolve(xhr.response);
          xhr.onerror = (e) => reject(new TypeError('網路請求失敗'));
          xhr.responseType = 'blob';
          xhr.open('GET', imageUri, true);
          xhr.send(null);
        });

        const filename = `replies/${deviceId}_${Date.now()}.jpg`;
        const storageRef = ref(activeStorage, filename); // 👈 使用確保留在記憶體中的實例
        
        const snapshot = await uploadBytes(storageRef, blob);
        firebaseUrl = await getDownloadURL(snapshot.ref);
        console.log("Step 2: 圖片上傳完成，網址:", firebaseUrl);
      } else if (imageUri && imageUri.startsWith('http')) {
        firebaseUrl = imageUri;
      }

      // 寫入 Firestore
      await addDoc(collection(db, 'replies'), {
        messageId: selectedMsg.id,
        toDeviceId: selectedMsg.deviceId,
        fromDeviceId: deviceId,
        replyText: replyText || '',
        imageUri: firebaseUrl, // 存入雲端 URL
        createdAt: serverTimestamp(),
      });

      console.log("Step 3: Firestore 寫入成功");
      setMsgModalVisible(false);
      setSelectedMsg(null);
    } catch (e) {
      console.error("❌ 上傳失敗原因:", e);
      alert('傳送失敗: ' + e.message);
    }
  };

  // 5. 監聽回覆資料 (略)
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

  // 6. 詳情頁動畫 (略)
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: replyDetailVisible ? 0 : SCREEN_WIDTH,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [replyDetailVisible]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Firebase 即時留言板</Text>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isMine = item.deviceId === deviceId;
          if (isMine) {
            // 若還沒建立動畫，則建立（只在點擊時建立，不在 render 階段 setState）
            let anim = shakeAnims.current[item.id];
            if (!anim) {
              anim = new Animated.Value(0);
              shakeAnims.current[item.id] = anim;
            }
            return (
              <Animated.View
                style={[
                  styles.msgBox,
                  {
                    transform: [
                      {
                        translateX: anim.interpolate({
                          inputRange: [-1, 1],
                          outputRange: [-10, 10],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    let anim = shakeAnims.current[item.id];
                    if (!anim) {
                      anim = new Animated.Value(0);
                      shakeAnims.current[item.id] = anim;
                    }
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
                  <Text style={[styles.msgText, { color: '#aaa' }]}>{item.content}</Text>
                </TouchableOpacity>
              </Animated.View>
            );
          } else {
            return (
              <TouchableOpacity
                style={styles.msgBox}
                onPress={() => {
                  setSelectedMsg(item);
                  setMsgModalVisible(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={{ color: '#888', fontSize: 12, marginBottom: 2 }}>
                  {item.deviceId?.slice(0, 8) || 'Unknown'}
                </Text>
                <Text style={styles.msgText}>{item.content}</Text>
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

      {/* 浮動按鈕 */}
      <View style={styles.fabContainer}>
        <TouchableOpacity style={styles.envelopeFab} onPress={() => setEnvelopeVisible(true)}>
          <Text style={styles.envelopeIcon}>✉️</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fab} onPress={() => setDialogVisible(true)}>
          <Text style={styles.fabIcon}>＋</Text>
        </TouchableOpacity>
      </View>

      {/* 信封 Modal */}
      <Modal visible={envelopeVisible} transparent animationType="fade" onRequestClose={() => setEnvelopeVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.envelopeDialog}>
            <Text style={styles.envelopeTitle}>收到的留言回覆</Text>
            <FlatList
              data={replies}
              keyExtractor={item => item.id}
              ListEmptyComponent={<Text style={{ color: '#888', marginVertical: 10 }}>目前沒有收到回覆</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.replyItem}
                  onPress={() => {
                    setSelectedReply(item);
                    setReplyDetailVisible(true);
                  }}
                >
                  <Text style={styles.replyLinkText} numberOfLines={1}>
                    {item.fromDeviceId?.slice(0, 8)}: {item.replyText}
                  </Text>
                  {item.imageUri && <Image source={{ uri: item.imageUri }} style={styles.replyThumb} />}
                </TouchableOpacity>
              )}
              style={{ maxHeight: 250, width: '100%' }}
            />
            <TouchableOpacity onPress={() => setEnvelopeVisible(false)} style={styles.closeBtn}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>關閉</Text>
            </TouchableOpacity>
          </View>

          {/* 右側滑入詳情 */}
          <Animated.View style={[styles.detailSlide, { transform: [{ translateX: slideAnim }] }]}>
            <View style={styles.envelopeDialog}>
              <TouchableOpacity onPress={() => setReplyDetailVisible(false)} style={styles.backBtn}>
                <Text style={styles.backBtnText}>←</Text>
              </TouchableOpacity>
              <View style={{ marginTop: 10, alignItems: 'center', width: '100%' }}>
                <Text style={styles.detailLabel}>原留言：</Text>
                <Text style={styles.detailText}>{messages.find(m => m.id === selectedReply?.messageId)?.content || '...'}</Text>
                <Text style={styles.detailLabel}>回覆內容：</Text>
                <Text style={styles.detailText}>{selectedReply?.replyText}</Text>
                {selectedReply?.imageUri && <Image source={{ uri: selectedReply.imageUri }} style={styles.detailImage} />}
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <FABDialog visible={dialogVisible} onClose={() => setDialogVisible(false)} text={text} setText={setText} onSend={handleSend} />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

// Styles 保持不變 ...
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingHorizontal: 20 },
  title: { fontSize: 22, fontWeight: 'bold', marginVertical: 20, textAlign: 'center', color: '#333' },
  msgBox: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, borderLeftWidth: 4, borderLeftColor: '#4630EB' },
  msgText: { fontSize: 16, color: '#444' },
  fabContainer: { position: 'absolute', right: 24, bottom: 36, alignItems: 'center' },
  fab: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#4630EB', justifyContent: 'center', alignItems: 'center', elevation: 5 },
  fabIcon: { color: '#fff', fontSize: 36, fontWeight: 'bold' },
  envelopeFab: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#ffb300', justifyContent: 'center', alignItems: 'center', marginBottom: 16, elevation: 5 },
  envelopeIcon: { fontSize: 30 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  envelopeDialog: { width: 300, backgroundColor: '#fff', borderRadius: 15, padding: 20, alignItems: 'center', elevation: 10 },
  envelopeTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#4630EB' },
  replyItem: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  replyLinkText: { flex: 1, color: '#4630EB', fontWeight: '500' },
  replyThumb: { width: 40, height: 40, borderRadius: 4, marginLeft: 10 },
  closeBtn: { marginTop: 15, backgroundColor: '#4630EB', paddingHorizontal: 30, paddingVertical: 10, borderRadius: 20 },
  detailSlide: { position: 'absolute', width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  backBtn: { position: 'absolute', left: 15, top: 15 },
  backBtnText: { fontSize: 24, color: '#4630EB', fontWeight: 'bold' },
  detailLabel: { color: '#4630EB', fontWeight: 'bold', marginTop: 10 },
  detailText: { marginVertical: 5, textAlign: 'center' },
  detailImage: { width: 200, height: 150, borderRadius: 10, marginTop: 10 },
});