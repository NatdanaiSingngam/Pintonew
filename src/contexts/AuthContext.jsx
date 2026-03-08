// src/contexts/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../firebase';
import { onAuthStateChanged, signInAnonymously, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';

// 1. สร้าง Context (กระบอกเสียง)
const AuthContext = createContext();

// 2. สร้าง Hook เอาไว้ให้หน้าอื่นเรียกใช้ชื่อง่ายๆ ว่า useAuth()
export function useAuth() {
  return useContext(AuthContext);
}

// 3. ตัวคลุมแอป (Provider)
export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("เกิดข้อผิดพลาดตอนล็อกอิน Google:", error);
    }
  };

  // ฟังก์ชันออกจากระบบ (เพื่อกลับไปเป็น Guest เหมือนเดิม)
  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("เกิดข้อผิดพลาดตอนออกจากระบบ:", error);
    }
  };

  useEffect(() => {
    // ดักฟังว่ามีใครล็อกอินอยู่ไหม
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // มีคนล็อกอินอยู่ (อาจจะเป็น Guest หรือล็อกอิน Google แล้ว)
        console.log("Current User:", user.uid, "| Is Guest:", user.isAnonymous);
        setCurrentUser(user);
        setLoading(false);
      } else {
        // ถ้าไม่มีใครล็อกอินเลย -> เสกบัญชี Guest ให้ทันที!
        try {
          console.log("No user found. Creating Anonymous Guest...");
          await signInAnonymously(auth);
        } catch (error) {
          console.error("Error creating guest:", error);
          setLoading(false);
        }
      }
    });

    return unsubscribe; // ล้างการดักฟังเมื่อปิดเว็บ
  }, []);

  return (
    // 👇 เพิ่ม loginWithGoogle และ logout เข้าไปใน value ครับ
    <AuthContext.Provider value={{ currentUser, loginWithGoogle, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}