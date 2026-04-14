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
    try {this.files = [];
this.totalSize = 0;
if (this.pc) {
    alert("⚠️ Session already started. Cannot add more files.");
    return;
}

        const handles = await window.showOpenFilePicker({ multiple: true });

        for (const handle of handles) {
            const file = await handle.getFile();

            this.files.push(file);
            this.totalSize += file.size;

            console.log("📁 File added:", file.name);
        }

        this.renderFileList(); // 🔥 NEW

        return {
            name: `${this.files.length} files selected`,
            size: this.totalSize
        };

    } catch (err) {
        console.error('❌ File selection failed:', err);
    }
}
// Rendering list
renderFileList() {
    const container = document.getElementById('file-name');

    if (!container) return;

    container.innerHTML = '';

    this.files.forEach((file, index) => {
        const div = document.createElement('div');
        div.className = "file-item";
        div.textContent = file.name;

        div.onclick = () => this.openFileMenu(index);

        container.appendChild(div);
    });

    // update size
    const sizeEl = document.getElementById('file-size');
    if (sizeEl) {
        sizeEl.textContent =
            `${(this.totalSize / 1024 / 1024).toFixed(2)} MB`;
    }
}

openFileMenu(index) {
    const file = this.files[index];

    const modal = document.createElement('div');
    modal.className = "modal";

   const removeBtn = document.createElement('button');
removeBtn.textContent = "❌ Remove";

const closeBtn = document.createElement('button');
closeBtn.textContent = "Close";

removeBtn.onclick = () => {
    this.removeFile(index);
    modal.remove();
};

closeBtn.onclick = () => modal.remove();

const box = document.createElement('div');
box.className = "modal-content";

box.appendChild(document.createTextNode(file.name));
box.appendChild(removeBtn);
box.appendChild(closeBtn);

modal.appendChild(box);

    document.body.appendChild(modal);

    
}
removeFile(index) {
    const removed = this.files.splice(index, 1);

    if (removed.length) {
        this.totalSize -= removed[0].size;
    }

    console.log("🗑 Removed:", removed[0].name);

    this.renderFileList();
}

    // ✅ FILE TRANSFER
async startTransfer() {
    if (!this.files.length || !this.dataChannel || this.dataChannel.readyState !== "open") {
    console.log("⚠️ Cannot start transfer");
    return;
}

    console.log("📤 Starting chunked transfer");

    const chunkSize = 64 * 1024; // 16KB

    for (const file of this.files) {

        // 🔹 Send metadata
        await this.safeSend(JSON.stringify({
            type: "fileInfo",
            name: file.name,
            size: file.size
        }));

        let offset = 0;

        while (offset < file.size) {

            const slice = file.slice(offset, offset + chunkSize);
            const buffer = await slice.arrayBuffer();

            if (this.dataChannel.readyState !== "open") {
    console.log("❌ Channel closed mid-transfer");
    return;
}

await this.safeSend(buffer);

            offset += chunkSize;

            // optional debug
            // console.log(`📦 ${file.name}: ${Math.floor((offset/file.size)*100)}%`);
        }

        // 🔹 File complete
        await this.safeSend(JSON.stringify({
            type: "complete"
        }));

        console.log("✅ Sent:", file.name);
    }

    console.log("🎉 All files sent (chunked)");
  
  
    
}

// safe send

async safeSend(data) {

    // ✅ WAIT until open (NO recursion)
    let retries = 0;

while (this.dataChannel.readyState !== "open") {
    if (retries++ > 100) {
        console.log("❌ Channel never opened");
        return;
    }
    await new Promise(r => setTimeout(r, 50));
}

    // ✅ WAIT for buffer to drain
    while (this.dataChannel.bufferedAmount > 256000) {
        await new Promise(r => setTimeout(r, 10));
    }

    // ✅ SEND
    this.dataChannel.send(data);
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