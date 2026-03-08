// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth"; // 👈 ต้องมีบรรทัดนี้
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCKPMNZkbrqeIl1R9ON1uBvyYY8vW0VXnA",
  authDomain: "pintoo-16b18.firebaseapp.com",
  projectId: "pintoo-16b18",
  storageBucket: "pintoo-16b18.firebasestorage.app",
  messagingSenderId: "432051351015",
  appId: "1:432051351015:web:82e0ce4128711d3f90a142",
  measurementId: "G-XXMCB5J3T5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export const auth = getAuth(app);
export const db = getFirestore(app);