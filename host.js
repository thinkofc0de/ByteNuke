import { Signaling, generateRoomId } from './signaling.js';
import { setDoc } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';

export class Host {
    constructor() {
    this.signaling = null;
    this.pc = null;
    this.dataChannel = null;

    this.files = []; // ✅ multiple files
    this.totalSize = 0; // ✅ combined size

    this.roomId = null;
    this.expiryTimestamp = null;
    this.timerInterval = null;

    this.iceQueue = [];
    this.remoteDescSet = false;
}

    async init() {
    try {
        console.log("🔵 Step 1: generate room");
        this.roomId = generateRoomId();

        console.log("🔵 Step 2: signaling create");
        this.signaling = new Signaling(this.roomId);

        console.log("🔵 Step 3: before createRoom");
        await this.signaling.createRoom();

        console.log("🟢 Step 4: after createRoom");

        // ✅ ONLY return room ID (NO WebRTC YET)
        return this.roomId;

    } catch (err) {
        console.error("❌ INIT ERROR:", err);
        throw err;
    }
}

    async startHosting() {

    this.pc = new RTCPeerConnection({
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" }
        ]
    });

    this.setupPeerConnection();

    // ✅ Answer listener
    this.signaling.onAnswer(async (answer) => {
        if (this.pc.currentRemoteDescription) return;

        console.log("📥 Answer received");

        await this.pc.setRemoteDescription(answer);

        this.remoteDescSet = true;

        this.iceQueue.forEach(c => this.pc.addIceCandidate(c));
        this.iceQueue = [];
    });

    // ✅ ICE listener
    this.signaling.onIceCandidate((candidate) => {
        if (this.remoteDescSet) {
            this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
            this.iceQueue.push(candidate);
        }
    });

    // ✅ Create offer ONLY NOW
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    // Send Offer
    await this.signaling.sendOffer({
        type: offer.type,
        sdp: offer.sdp
    });
    // Active 
     await setDoc(this.signaling.roomRef, {
    status: "active"
}, { merge: true });
    console.log("🚀 Hosting started");
}

    setupPeerConnection() {
        // ✅ ICE SEND
        this.pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log("📤 ICE sent");

                this.signaling.sendIceCandidate({
                    candidate: event.candidate.candidate,
                    sdpMid: event.candidate.sdpMid,
                    sdpMLineIndex: event.candidate.sdpMLineIndex
                });
            }
        };

        this.pc.onconnectionstatechange = () => {
            console.log("🔗 Connection state:", this.pc.connectionState);
        };

        // ✅ DATA CHANNEL
        this.dataChannel = this.pc.createDataChannel('fileTransfer');

       this.dataChannel.onopen = () => {
    console.log('✅ DataChannel opened');

    // 🔥 AUTO START TRANSFER
    this.startTransfer();
};

        this.dataChannel.onmessage = (event) => {
            console.log("📥 Data received:", event.data);
        };
    }

    waitForChannelOpen() {
    return new Promise(resolve => {
        if (this.dataChannel.readyState === "open") {
            resolve();
        } else {
            const checkOpen = () => {
                if (this.dataChannel.readyState === "open") {
                    console.log("🔓 DataChannel ready");

                    this.dataChannel.removeEventListener('open', checkOpen);
                    resolve();
                }
            };

            this.dataChannel.addEventListener('open', checkOpen);
        }
    });
}

    // ✅ FILE SELECT
    async selectFile() {
    try {
        const handles = await window.showOpenFilePicker({ multiple: true });
        this.files = [];
        this.totalSize = 0;
        for (const handle of handles) {
            const file = await handle.getFile();

            this.files.push(file);
            this.totalSize += file.size;

            console.log("📁 File added:", file.name);
        }

        // ✅ UI UPDATE
        const fileNameElem = document.getElementById('file-name');
        const fileSizeElem = document.getElementById('file-size');

        if (fileNameElem) {
            fileNameElem.textContent = this.files.map(f => f.name).join(", ");
        }

        if (fileSizeElem) {
            fileSizeElem.textContent =
                `${(this.totalSize / 1024 / 1024).toFixed(2)} MB`;
        }

        return {
            name: this.files.map(f => f.name).join(", "),
            size: this.totalSize
        };

    } catch (err) {
        console.error('❌ File selection failed:', err);
    }
}


    // ✅ FILE TRANSFER
async startTransfer() {
    if (!this.files.length || !this.dataChannel || this.dataChannel.readyState !== "open") {
    console.log("⚠️ Cannot start transfer yet");
    return;
}

    console.log("📤 Starting sequential transfer");

    for (const file of this.files) {

        // ✅ Send metadata
        this.dataChannel.send(JSON.stringify({
            type: "fileInfo",
            name: file.name,
            size: file.size
        }));

        // ✅ WAIT for file to fully send
        await new Promise((resolve) => {
            const reader = new FileReader();

           reader.onload = async () => {

    // 🔒 ALWAYS wait before sending
    await this.waitForChannelOpen();

    // 🔒 Buffer control
    while (this.dataChannel.bufferedAmount > 256000) {
        await new Promise(r => setTimeout(r, 50));
    }

    try {
        this.dataChannel.send(reader.result);
    } catch (err) {
        console.error("❌ Send failed, retrying...", err);

        await this.waitForChannelOpen();
        this.dataChannel.send(reader.result);
    }

    // 🔒 WAIT again before sending "complete"
    await this.waitForChannelOpen();

    while (this.dataChannel.bufferedAmount > 256000) {
        await new Promise(r => setTimeout(r, 50));
    }

    this.dataChannel.send(JSON.stringify({
        type: "complete"
    }));

    console.log("✅ Sent:", file.name);

    resolve();
};
            reader.readAsArrayBuffer(file);
        });
    }

    console.log("🎉 All files sent properly");
    this.dataChannel.send(JSON.stringify({
    type: "allComplete"
}));

    setTimeout(() => {
    console.log("🛑 Closing after delay...");
    this.cleanup();
}, 5000); // wait 5 seconds
this.dataChannel.send(JSON.stringify({
    type: "allComplete"
}));

}




    // ✅ TIMER
    async setTimer(minutes) {
        try {
            const expiry = Date.now() + minutes * 60 * 1000;
            this.expiryTimestamp = expiry;

            await setDoc(
                this.signaling.roomRef,
                { expiry: expiry },
                { merge: true }
            );

            console.log(`⏱ Room expires at ${new Date(expiry)}`);

            this.startTimerCountdown(minutes * 60);

        } catch (err) {
            console.error("❌ Timer error:", err);
        }
    }

    startTimerCountdown(seconds) {
        this.timerInterval = setInterval(() => {
            seconds--;

            const min = Math.floor(seconds / 60);
            const sec = seconds % 60;

            const elem = document.getElementById('remaining-time');
            if (elem) {
                elem.textContent =
                    `${min}:${sec.toString().padStart(2, '0')}`;
            }

            if (seconds <= 0) {
                this.cleanup();
            }
        }, 1000);
    }

    async cleanup() {
        console.log("🧹 Cleaning up...");

        if (this.timerInterval) clearInterval(this.timerInterval);
        if (this.pc) this.pc.close();
        if (this.signaling) await this.signaling.cleanup();
    }
}   