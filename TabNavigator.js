import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Home from './Home';
import Pet from './Pet';
import Profile from './Profile';

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Home" component={Home} />
      <Tab.Screen name="Pet" component={Pet} />
      <Tab.Screen name="Profile" component={Profile} />
    </Tab.Navigator>
  );
}