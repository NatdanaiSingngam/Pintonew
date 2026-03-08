import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../firebase';
// 👇 เพิ่ม getRedirectResult เข้ามาช่วยดักจับข้อมูล
import { onAuthStateChanged, signInAnonymously, GoogleAuthProvider, signInWithRedirect, getRedirectResult, signOut } from 'firebase/auth';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. ทันทีที่โหลดเว็บ ให้เช็คก่อนเลยว่า "เพิ่งเด้งกลับมาจากหน้า Google หรือเปล่า?"
    getRedirectResult(auth).catch((error) => {
      console.error("มีปัญหาตอนเด้งกลับมาจาก Google:", error);
    });

    // 2. เฝ้าดูการเปลี่ยนสถานะ
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // ถ้ามีคนล็อกอินอยู่แล้ว (Google หรือ Guest) ให้เก็บข้อมูลไว้
        setCurrentUser(user);
        setLoading(false);
      } else {
        // ถ้าไม่มีใครเลยจริงๆ ค่อยสร้าง Guest ใหม่
        signInAnonymously(auth).then(() => {
          setLoading(false);
        }).catch((err) => {
          console.error("สร้าง Guest ไม่สำเร็จ:", err);
          setLoading(false);
        });
      }
    });

    return unsubscribe;
  }, []);

  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      // 💡 เวทมนตร์: สั่งให้ออกจากร่าง Guest ก่อน ค่อยกระโดดไปหน้าล็อกอิน
      if (currentUser?.isAnonymous) {
        await signOut(auth);
      }
      await signInWithRedirect(auth, provider);
    } catch (error) {
      console.error("เกิดข้อผิดพลาดตอนล็อกอิน Google:", error);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("เกิดข้อผิดพลาดตอนออกจากระบบ:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, loginWithGoogle, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}