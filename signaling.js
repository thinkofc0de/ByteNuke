// signaling.js - Firebase Firestore signaling for WebRTC handshake

import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    onSnapshot, 
    deleteDoc, 
    collection, 
    addDoc 
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAtfLL3yGwaD8MmWtMRD6nn5jQcpyylfsw",
  authDomain: "bytenuke-f44e4.firebaseapp.com",
  projectId: "bytenuke-f44e4",
  storageBucket: "bytenuke-f44e4.firebasestorage.app",
  messagingSenderId: "1086265362564",
  appId: "1:1086265362564:web:5290ae84d2148a22145ad1",
  measurementId: "G-Q8375DJ84X"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 🔥 Utility to generate room ID
export function generateRoomId() {
    return Math.random().toString(36).substring(2, 8);
}

export class Signaling {
    constructor(roomId) {
        if (!roomId) {
            throw new Error("Room ID is required");
        }
        this.roomId = roomId;
        this.roomRef = doc(db, 'rooms', roomId);
        this.listeners = {};
    }

    // ✅ Create Room (FIXED)
   async createRoom() {
    try {
        await setDoc(this.roomRef, {
            status: "waiting",   // 🔥 IMPORTANT
            createdAt: Date.now()
        });

        console.log('✅ Room created:', this.roomId);
    } catch (e) {
        console.error("❌ Room creation failed:", e);
        throw e;
    }
}

    // ✅ Join Room
    async joinRoom() {
        try {
            const docSnap = await getDoc(this.roomRef);
            if (!docSnap.exists()) {
                throw new Error('Room not found');
            }
            console.log("✅ Joined room:", this.roomId);
        } catch (e) {
            console.error("❌ Join failed:", e);
            throw e;
        }
    }

    // ✅ Send Offer (FIXED)
    async sendOffer(offer) {
        try {
            await setDoc(this.roomRef, {
                offer: {
                    type: offer.type,
                    sdp: offer.sdp
                }
            }, { merge: true });

            console.log('📤 Offer sent:', this.roomId);

        } catch (e) {
            console.error("❌ Offer send failed:", e);
        }
    }

    // ✅ Listen for Offer
    onOffer(callback) {
        this.listeners.offer = onSnapshot(this.roomRef, (docSnap) => {
            const data = docSnap.data();
            if (data && data.offer) {
                console.log("📥 Offer received");
                callback(new RTCSessionDescription(data.offer));
            }
        });
    }

    // ✅ Send Answer (FIXED)
    async sendAnswer(answer) {
        try {
            await setDoc(this.roomRef, {
                answer: {
                    type: answer.type,
                    sdp: answer.sdp
                }
            }, { merge: true });

            console.log("📤 Answer sent");

        } catch (e) {
            console.error("❌ Answer send failed:", e);
        }
    }

    // ✅ Listen for Answer
    onAnswer(callback) {
        this.listeners.answer = onSnapshot(this.roomRef, (docSnap) => {
            const data = docSnap.data();
            if (data && data.answer) {
                console.log("📥 Answer received");
                callback(new RTCSessionDescription(data.answer));
            }
        });
    }

    // ✅ Send ICE Candidate
    async sendIceCandidate(candidate) {
    try {
        const candidatesRef = collection(db, 'rooms', this.roomId, 'candidates');

        // ✅ FIX: store candidate directly (NO toJSON)
        await addDoc(candidatesRef, candidate);

        console.log('📤 ICE sent');
    } catch (e) {
        console.error("❌ ICE send failed:", e);
    }
}

    // ✅ Listen for ICE Candidates
    onIceCandidate(callback) {
        const candidatesRef = collection(db, 'rooms', this.roomId, 'candidates');

        this.listeners.ice = onSnapshot(candidatesRef, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    console.log("📥 ICE received");
                    callback(new RTCIceCandidate(change.doc.data()));
                }
            });
        });
    }

    // ✅ Cleanup Room
    async cleanup() {
        try {
            await deleteDoc(this.roomRef);
            console.log("🧹 Room deleted");
        } catch (e) {
            console.error("❌ Cleanup failed:", e);
        }

        // unsubscribe listeners
        Object.values(this.listeners).forEach(unsub => {
            if (unsub) unsub();
        });
    }
}