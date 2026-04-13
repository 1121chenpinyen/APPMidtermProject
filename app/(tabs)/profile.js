import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert, TextInput, Keyboard, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getDeviceId } from '../../utils/getDeviceId';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, storage } from '../../config/firebaseConfig';
import { collection, doc, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useMoney } from '../../context/moneyContext';

export default function ProfilePage() {
  const [avatar, setAvatar] = useState(null);
  const [userId, setUserId] = useState('');
  const [editingId, setEditingId] = useState(false);
  const [tempId, setTempId] = useState('');
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState(null);
  const { money } = useMoney();

  useEffect(() => {
    getDeviceId().then(setDeviceId);
  }, []);

  useEffect(() => {
    if (!deviceId) return;
    const fetchProfile = async () => {
      try {
        const docRef = doc(collection(db, 'profiles'), deviceId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.avatarUrl) setAvatar(data.avatarUrl);
        }
      } catch (e) {}
    };
    fetchProfile();
  }, [deviceId]);

  useEffect(() => {
    const fetchId = async () => {
      try {
        const localId = await AsyncStorage.getItem('userId');
        if (localId && localId.trim().length > 0) {
          setUserId(localId);
          setTempId(localId);
        } else {
          setUserId(deviceId);
          setTempId(deviceId);
        }
      } catch (e) {
        setUserId(deviceId);
        setTempId(deviceId);
      }
      setLoading(false);
    };
    fetchId();
  }, [deviceId]);

  const uploadAvatar = async (uri) => {
    if (!deviceId) return;
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const filename = `avatars/${deviceId}_${Date.now()}.jpg`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      await setDoc(doc(collection(db, 'profiles'), deviceId), { avatarUrl: url, userId: userId || deviceId }, { merge: true });
      setAvatar(url);
      await AsyncStorage.setItem('avatarUrl', url);
      Alert.alert('頭像已更新！');
    } catch (e) {
      Alert.alert('頭像上傳失敗', e.message);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('權限不足', '請允許存取相簿權限');
      return;
    }
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.canceled) {
      uploadAvatar(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('權限不足', '請允許相機權限');
      return;
    }
    let result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.canceled) {
      uploadAvatar(result.assets[0].uri);
    }
  };

  const handleEditAvatar = () => {
    Alert.alert(
      '更換頭像',
      '請選擇來源',
      [
        { text: '從相簿選擇', onPress: pickImage },
        { text: '拍照', onPress: takePhoto },
        { text: '取消', style: 'cancel' },
      ]
    );
  };

  const saveId = async (newId) => {
    setUserId(newId);
    setEditingId(false);
    setTempId(newId);
    try {
      await AsyncStorage.setItem('userId', newId);
      // 寫入 Firebase profiles
      if (deviceId && newId) {
        await setDoc(doc(collection(db, 'profiles'), deviceId), { userId: newId }, { merge: true });
      }
    } catch (e) {
      Alert.alert('儲存失敗', '請檢查裝置儲存空間');
    }
    Keyboard.dismiss();
  };

  if (loading) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}> 
        <ActivityIndicator size="large" color="#888" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header} />
      <View style={styles.sheet}>
        <View style={styles.avatarContainer}>
          <Image
            source={avatar ? { uri: avatar } : require('../../assets/avatar-placeholder.png')}
            style={styles.avatar}
          />
          <TouchableOpacity style={styles.editBtn} onPress={handleEditAvatar}>
            <MaterialIcons name="edit" size={22} color="#333" />
          </TouchableOpacity>
        </View>
        <View style={styles.idRow}>
          {editingId ? (
            <TextInput
              style={styles.idInput}
              value={tempId}
              onChangeText={setTempId}
              autoFocus
              onSubmitEditing={() => saveId(tempId)}
              onBlur={() => saveId(tempId)}
              maxLength={20}
            />
          ) : (
            <Text style={styles.userId}>{userId}</Text>
          )}
          <TouchableOpacity style={styles.editBtnSmall} onPress={() => {
            setTempId(userId);
            setEditingId(true);
          }}>
            <MaterialIcons name="edit" size={20} color="#333" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#d6ecf7',
  },
  header: {
    height: 120,
    backgroundColor: '#d6ecf7',
  },
  sheet: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -40,
    alignItems: 'center',
    paddingTop: 60,
  },
  avatarContainer: {
    position: 'absolute',
    top: -60,
    alignSelf: 'center',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: '#fff',
    backgroundColor: '#eee',
  },
  editBtn: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#eee',
  },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 36,
    marginBottom: 16,
    justifyContent: 'center',
    width: '80%',
    alignSelf: 'center',
    position: 'relative',
  },
  userId: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  idInput: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    borderBottomWidth: 1,
    borderColor: '#aaa',
    flex: 1,
    textAlign: 'center',
    minWidth: 120,
    paddingVertical: 2,
  },
  editBtnSmall: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 2,
    borderWidth: 1,
    borderColor: '#eee',
    marginLeft: 8,
    position: 'absolute',
    right: 0,
    top: '50%',
    transform: [{ translateY: -14 }],
  },
});

// Expo Router 頁面元件名稱需為 ProfilePage
