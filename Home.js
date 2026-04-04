import React, { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { StyleSheet, Text, View, FlatList, SafeAreaView, TouchableOpacity, Modal, Image, Animated, Dimensions, Vibration } from 'react-native';
const SCREEN_WIDTH = Dimensions.get('window').width;
import MessageModal from './MessageModal';
import { StatusBar } from 'expo-status-bar';
import FABDialog from './FABDialog';
import { db } from './firebaseConfig';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, where } from 'firebase/firestore';

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

  useEffect(() => {
    const getOrCreateDeviceId = async () => {
      let id = await AsyncStorage.getItem('deviceId');
      if (!id) {
        id = await Crypto.getRandomBytesAsync(16).then(bytes =>
          Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
        );
        await AsyncStorage.setItem('deviceId', id);
      }
      setDeviceId(id);
    };
    getOrCreateDeviceId();
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
    if (text.length > 0 && deviceId) {
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

  // 回覆留言，存到 replies 集合
  const handleReply = async (replyText, imageUri) => {
    if (!selectedMsg || !deviceId) return;
    try {
      await addDoc(collection(db, 'replies'), {
        messageId: selectedMsg.id,
        toDeviceId: selectedMsg.deviceId,
        fromDeviceId: deviceId,
        replyText,
        imageUri: imageUri || null,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('回覆儲存失敗:', e);
    }
  };

  // 監聽回覆資料（顯示所有本裝置發出的留言收到的回覆）
  useEffect(() => {
    if (!deviceId) return;
    // 先取得本裝置發出的所有留言 id
    const qMsg = query(collection(db, 'chat'), where('deviceId', '==', deviceId));
    const unsubscribeMsg = onSnapshot(qMsg, (querySnapshot) => {
      const myMsgIds = [];
      querySnapshot.forEach((doc) => {
        myMsgIds.push(doc.id);
      });
      if (myMsgIds.length === 0) {
        setReplies([]);
        return;
      }
      // 再查詢 replies 中 messageId 屬於這些 id 的所有回覆
      // Firestore in 查詢一次最多 10 個元素，需分批查詢
      const batchSize = 10;
      const batches = [];
      for (let i = 0; i < myMsgIds.length; i += batchSize) {
        batches.push(myMsgIds.slice(i, i + batchSize));
      }
      const unsubscribes = [];
      let allReplies = [];
      batches.forEach((batch) => {
        const qReply = query(collection(db, 'replies'), where('messageId', 'in', batch), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(qReply, (querySnapshot) => {
          const data = [];
          querySnapshot.forEach((doc) => {
            data.push({ ...doc.data(), id: doc.id });
          });
          // 合併所有批次回覆
          allReplies = allReplies.filter(r => !batch.includes(r.messageId)).concat(data);
          setReplies([...allReplies].sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds));
        });
        unsubscribes.push(unsub);
      });
      // 清理
      return () => {
        unsubscribes.forEach(unsub => unsub());
      };
    });
    return () => unsubscribeMsg();
  }, [deviceId]);

  // 滑入詳情頁效果
  useEffect(() => {
    if (replyDetailVisible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_WIDTH,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }
  }, [replyDetailVisible]);

  // 震動動畫狀態
  const [shakingId, setShakingId] = useState(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // 觸發震動動畫
  const triggerShake = (id) => {
    setShakingId(id);
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 1, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -1, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 1, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start(() => setShakingId(null));
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Firebase 即時留言板</Text>
      {/* <Text>Device ID: {deviceId}</Text> */}
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isMine = item.deviceId === deviceId;
          const isShaking = shakingId === item.id;
          return (
            <Animated.View
              style={isShaking ? { transform: [{ translateX: shakeAnim.interpolate({
                inputRange: [-1, 1], outputRange: [-10, 10]
              }) }] } : undefined}
            >
              <TouchableOpacity
                style={styles.msgBox}
                onPress={() => {
                  if (isMine) {
                    triggerShake(item.id);
                    return;
                  }
                  setSelectedMsg(item);
                  setMsgModalVisible(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={{ color: '#888', fontSize: 12, marginBottom: 2 }}>
                  {isMine ? 'You' : (item.deviceId?.slice(0, 8) || '')}
                </Text>
                <Text style={[styles.msgText, isMine && { color: '#aaa' }]}>{item.content}</Text>
              </TouchableOpacity>
            </Animated.View>
          );
        }}
      />
      <MessageModal
        visible={msgModalVisible}
        onClose={() => setMsgModalVisible(false)}
        message={selectedMsg?.content}
        onReply={handleReply}
      />
      {/* 浮動按鈕區塊 */}
      <View style={styles.fabContainer}>
        <TouchableOpacity
          style={styles.envelopeFab}
          onPress={() => setEnvelopeVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.envelopeIcon}>✉️</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setDialogVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.fabIcon}>＋</Text>
        </TouchableOpacity>
      </View>
      {/* 信封覆蓋視窗：顯示所有回覆給本裝置的留言 */}
      <Modal
        visible={envelopeVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEnvelopeVisible(false)}
      >
        <View style={styles.overlay}>
          {/* 信封頁面本體 */}
          <View style={styles.envelopeDialog}>
            <Text style={styles.envelopeTitle}>收到的留言回覆</Text>
            <FlatList
              data={replies}
              keyExtractor={item => item.id}
              ListEmptyComponent={<Text style={{ color: '#888', marginBottom: 10 }}>目前沒有收到回覆</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={{ marginBottom: 12, alignItems: 'flex-start', width: '100%' }}
                  onPress={() => {
                    setSelectedReply(item);
                    setReplyDetailVisible(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontWeight: 'bold', color: '#4630EB' }}>
                    {item.fromDeviceId?.slice(0, 8) || ''}: {item.replyText}
                  </Text>
                  {item.imageUri ? (
                    <Image source={{ uri: item.imageUri }} style={{ width: 100, height: 75, borderRadius: 6, marginBottom: 2 }} />
                  ) : null}
                </TouchableOpacity>
              )}
              style={{ maxHeight: 220, width: 220, alignSelf: 'center' }}
            />
            <TouchableOpacity onPress={() => setEnvelopeVisible(false)} style={styles.closeBtn}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>關閉</Text>
            </TouchableOpacity>
          </View>
          {/* 回覆詳情頁，完全覆蓋信封頁面，從右側滑入 */}
          {replyDetailVisible && (
            <Animated.View
              style={[
                styles.overlay,
                {
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: '100%',
                  height: '100%',
                  backgroundColor: 'rgba(0,0,0,0.3)',
                  zIndex: 20,
                  transform: [{ translateX: slideAnim }],
                  justifyContent: 'center',
                  alignItems: 'center',
                },
              ]}
            >
              <View style={styles.envelopeDialog}>
                <TouchableOpacity onPress={() => setReplyDetailVisible(false)} style={{ position: 'absolute', left: 12, top: 18, zIndex: 2 }}>
                  <Text style={{ fontSize: 22, color: '#4630EB', fontWeight: 'bold' }}>{'←'}</Text>
                </TouchableOpacity>
                <View style={{ marginTop: 8, alignItems: 'center' }}>
                  <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 10 }}>回覆詳情</Text>
                  <Text style={{ color: '#4630EB', marginBottom: 6 }}>原留言：</Text>
                  <Text style={{ marginBottom: 10, textAlign: 'center' }}>
                    {selectedReply ? (messages.find(m => m.id === selectedReply.messageId)?.content || '(找不到原留言)') : ''}
                  </Text>
                  <Text style={{ color: '#4630EB', marginBottom: 6 }}>回覆內容：</Text>
                  <Text style={{ marginBottom: 10, textAlign: 'center' }}>
                    {selectedReply?.replyText}
                  </Text>
                  {selectedReply?.imageUri ? (
                    <Image source={{ uri: selectedReply.imageUri }} style={{ width: 120, height: 90, borderRadius: 8, marginBottom: 10 }} />
                  ) : null}
                </View>
              </View>
            </Animated.View>
          )}
        </View>
      </Modal>
      <FABDialog
        visible={dialogVisible}
        onClose={() => setDialogVisible(false)}
        text={text}
        setText={setText}
        onSend={handleSend}
      />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginVertical: 20,
    textAlign: 'center',
    color: '#333',
  },
  fabContainer: {
    position: 'absolute',
    right: 24,
    bottom: 36,
    alignItems: 'center',
  },
  envelopeFab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ffb300',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  envelopeIcon: {
    fontSize: 30,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4630EB',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
    overlay: {
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0,0,0,0.3)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    envelopeDialog: {
      width: 280,
      backgroundColor: '#fff',
      borderRadius: 12,
      padding: 24,
      alignItems: 'center',
      elevation: 6,
    },
    envelopeTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      marginBottom: 20,
      color: '#4630EB',
    },
    closeBtn: {
      marginTop: 10,
      backgroundColor: '#4630EB',
      paddingHorizontal: 24,
      paddingVertical: 10,
      borderRadius: 8,
    },
  fabIcon: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  msgBox: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    borderLeftWidth: 4,
    borderLeftColor: '#4630EB',
  },
  msgText: {
    fontSize: 16,
    color: '#444',
  },
  // 新增滑入側頁樣式
  slideOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
});