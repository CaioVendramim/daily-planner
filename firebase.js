import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  collection,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyB8wHh14IL4vYAhNoFOH6YQwvYy4qqXlrs",
  authDomain: "daily-planner-a256d.firebaseapp.com",
  projectId: "daily-planner-a256d",
  storageBucket: "daily-planner-a256d.firebasestorage.app",
  messagingSenderId: "809929473231",
  appId: "1:809929473231:web:3ca931f108e379ef870bba",
  measurementId: "G-Y5WLX681QE"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export {
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  doc,
  collection,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  storageRef,
  uploadBytes,
  getDownloadURL
};
