import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAswUWIonfEiMe-yk7cyWSxF0WwMwtZvQI",
  authDomain: "supervision-regional-5d0d4.firebaseapp.com",
  projectId: "supervision-regional-5d0d4",
  storageBucket: "supervision-regional-5d0d4.firebasestorage.app",
  messagingSenderId: "433217669413",
  appId: "1:433217669413:web:43acffb2e395e8c69a72cc"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
