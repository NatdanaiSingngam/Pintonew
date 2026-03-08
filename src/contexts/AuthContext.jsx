import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../firebase';
import { 
  onAuthStateChanged, 
  GoogleAuthProvider, 
  signInWithRedirect, 
  getRedirectResult, 
  signOut,
  signInAnonymously 
} from 'firebase/auth';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        // 1. รอผลจากการ Redirect ให้เสร็จก่อน (สำคัญมาก!)
        await getRedirectResult(auth);
        
        // 2. ตรวจสอบสถานะการล็อกอิน
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
          if (user) {
            // ถ้ามี User (ไม่ว่าเป็น Google หรือ Guest) ให้หยุด Loading ทันที
            setCurrentUser(user);
            setLoading(false);
          } else {
            // 3. ถ้าไม่มี User จริงๆ ถึงจะอนุญาตให้สร้าง Guest
            try {
              const guestResult = await signInAnonymously(auth);
              setCurrentUser(guestResult.user);
            } catch (err) {
              console.error("สร้าง Guest ล้มเหลว:", err);
            }
            setLoading(false);
          }
        });

        return unsubscribe;
      } catch (error) {
        console.error("Auth Init Error:", error);
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      // สั่งให้ออกจากร่างเดิมก่อนเพื่อให้ Redirect สะอาดที่สุด
      await signOut(auth);
      await signInWithRedirect(auth, provider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      // พอกด Logout ระบบ onAuthStateChanged ข้างบนจะพาเข้า Guest ให้อัตโนมัติ
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