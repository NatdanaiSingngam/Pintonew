import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../firebase';
import { 
  onAuthStateChanged, 
  signInAnonymously, 
  GoogleAuthProvider, 
  signInWithPopup, // 👈 กลับมาใช้ Popup
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
    // เฝ้าดูสถานะผู้ใช้
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        setLoading(false);
      } else {
        // ถ้าไม่มีใครล็อกอิน ให้เข้าโหมด Guest อัตโนมัติ
        signInAnonymously(auth).catch((err) => {
          console.error("Guest login failed:", err);
        });
      }
    });

    return unsubscribe;
  }, []);

  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      // 💡 ใช้ Popup จะไม่มีปัญหาเรื่องลืมสถานะตอนเด้งกลับมา
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Google Login Error:", error);
      if (error.code === 'auth/popup-blocked') {
        alert("กรุณาอนุญาตให้เปิดหน้าต่าง Pop-up สำหรับไซต์นี้ด้วยนะครับ 🔓");
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