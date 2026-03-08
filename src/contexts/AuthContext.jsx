import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../firebase'; // 👇 อย่าลืม import db มาด้วยนะครับ
import { 
  onAuthStateChanged, 
  signInAnonymously, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut 
} from 'firebase/auth';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore'; // 👈 เพิ่มเครื่องมือจัดการฐานข้อมูล

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // 🪄 ฟังก์ชันสำหรับโอนข้อมูลจาก Guest มายังบัญชีจริง
  const transferGuestDataToUser = async (guestUid, newUid) => {
    if (!guestUid || !newUid || guestUid === newUid) return;

    try {
      const q = query(collection(db, "recipes"), where("authorId", "==", guestUid));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) return;

      const batch = writeBatch(db);
      querySnapshot.forEach((recipeDoc) => {
        const docRef = doc(db, "recipes", recipeDoc.id);
        // เปลี่ยนเจ้าของเป็น UID ใหม่ และอัปเดตชื่อผู้เขียนให้เป็นชื่อจริง
        batch.update(docRef, { 
          authorId: newUid,
          author: auth.currentUser.displayName || "เชฟ Pinto"
        });
      });

      await batch.commit();
      console.log("โอนข้อมูลสำเร็จ!");
    } catch (error) {
      console.error("โอนข้อมูลไม่สำเร็จ:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const guestUid = currentUser?.isAnonymous ? currentUser.uid : null; // จำ UID Guest ไว้ก่อน

    try {
      const result = await signInWithPopup(auth, provider);
      const newUid = result.user.uid;

      // ถ้าก่อนหน้านี้เป็น Guest ให้สั่งโอนข้อมูลทันที
      if (guestUid) {
        await transferGuestDataToUser(guestUid, newUid);
      }
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      // ระบบจะเด้งเข้า Guest ใหม่ให้อัตโนมัติจาก useEffect (ถ้าเราเขียนดักไว้)
      // หรือจะปล่อยให้หน้าเว็บว่างจนกว่าจะรีเฟรชก็ได้ครับ
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