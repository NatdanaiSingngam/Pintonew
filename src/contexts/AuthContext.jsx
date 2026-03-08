import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../firebase';
import { 
  onAuthStateChanged, 
  signInAnonymously, 
  GoogleAuthProvider, 
  signInWithPopup, 
  linkWithPopup, // 👈 เพิ่มตัวนี้เข้ามา
  signOut 
} from 'firebase/auth';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        setLoading(false);
      } else {
        signInAnonymously(auth).catch((err) => {
          console.error("Guest login failed:", err);
          setLoading(false);
        });
      }
    });
    return unsubscribe;
  }, []);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      if (currentUser && currentUser.isAnonymous) {
        // 🔥 เวทมนตร์อยู่ตรงนี้: ถ้าเป็น Guest ให้เอาบัญชี Google มา "ผูก" แทนที่
        await linkWithPopup(currentUser, provider);
        // หลังจากผูกเสร็จ currentUser จะเปลี่ยนจาก Anonymous เป็น Google User โดยที่ UID เดิมไม่เปลี่ยน!
      } else {
        // ถ้าไม่ได้เป็น Guest (เช่น เผลอ logout ไปแล้ว) ก็ให้ Login ปกติ
        await signInWithPopup(auth, provider);
      }
    } catch (error) {
      console.error("Link/Login Error:", error);
      // กรณีบัญชี Google นี้เคยผูกกับ UID อื่นไปแล้ว อาจเกิด error 'auth/credential-already-in-use'
      // ให้สลับไปใช้การ Login ปกติแทน
      if (error.code === 'auth/credential-already-in-use') {
        await signInWithPopup(auth, provider);
      }
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, loginWithGoogle, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}