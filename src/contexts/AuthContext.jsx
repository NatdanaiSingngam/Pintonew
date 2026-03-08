import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { 
  onAuthStateChanged, 
  signInAnonymously, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut 
} from 'firebase/auth';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // 🪄 ฟังก์ชันโอนข้อมูล (ปรับปรุงให้ปลอดภัยขึ้น)
  const transferData = async (oldUid, newUid, newDisplayName) => {
    if (!oldUid || !newUid || oldUid === newUid) return;
    
    try {
      const q = query(collection(db, "recipes"), where("authorId", "==", oldUid));
      const snapshot = await getDocs(q);
      if (snapshot.empty) return;

      const batch = writeBatch(db);
      snapshot.forEach((d) => {
        batch.update(doc(db, "recipes", d.id), { 
          authorId: newUid,
          author: newDisplayName || "เชฟ Pinto"
        });
      });
      await batch.commit();
      console.log("Transfer success!");
    } catch (err) {
      console.error("Transfer error:", err);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
      
      // ถ้าไม่มี user เลย ให้เข้า Guest
      if (!user) {
        signInAnonymously(auth).catch(console.error);
      }
    });
    return unsubscribe;
  }, []);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    // 1. จำ UID เดิมไว้ก่อน (ร่าง Guest)
    const oldUid = currentUser?.isAnonymous ? currentUser.uid : null;

    try {
      // 2. ล็อกอินใหม่
      const result = await signInWithPopup(auth, provider);
      const newUser = result.user;

      // 3. ถ้าของเดิมเป็น Guest และล็อกอินใหม่สำเร็จ ให้สั่งโอนข้อมูล
      if (oldUid && newUser.uid !== oldUid) {
        await transferData(oldUid, newUser.uid, newUser.displayName);
      }
    } catch (error) {
      console.error("Login error:", error);
      alert("ล็อกอินไม่สำเร็จ กรุณาลองใหม่อีกครั้งครับ");
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, loginWithGoogle, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}