
import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert, TextInput, Keyboard, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';


export default function Profile() {
  const [avatar, setAvatar] = useState(null);
  // 使用者ID（預設用裝置唯一ID，這裡先用隨機字串模擬）
  const [userId, setUserId] = useState('user_' + Math.random().toString(36).substring(2, 8));
  const [editingId, setEditingId] = useState(false);
  const [tempId, setTempId] = useState(userId);

  // 選擇或拍照上傳頭像
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
      setAvatar(result.assets[0].uri);
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
      setAvatar(result.assets[0].uri);
    }
  };

  // 彈出 Alert 讓用戶選擇來源
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

  return (
    <View style={styles.root}>
      <View style={styles.header} />
      <View style={styles.sheet}>
        <View style={styles.avatarContainer}>
          <Image
            source={avatar ? { uri: avatar } : require('./assets/avatar-placeholder.png')}
            style={styles.avatar}
          />
          <TouchableOpacity style={styles.editBtn} onPress={handleEditAvatar}>
            <MaterialIcons name="edit" size={22} color="#333" />
          </TouchableOpacity>
        </View>
        {/* 使用者ID區塊 */}
        <View style={styles.idRow}>
          {editingId ? (
            <TextInput
              style={styles.idInput}
              value={tempId}
              onChangeText={setTempId}
              autoFocus
              onSubmitEditing={() => {
                setUserId(tempId);
                setEditingId(false);
                Keyboard.dismiss();
              }}
              onBlur={() => {
                setUserId(tempId);
                setEditingId(false);
              }}
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
        {/* 這裡可加更多 Profile 內容 */}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#d6ecf7', // 淺藍色
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
    marginTop: 36, // 往上移動
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