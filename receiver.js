import { Signaling } from './signaling.js';
import { getDoc } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';

export class Receiver {
    constructor() {
        this.signaling = null;
        this.pc = null;
        this.dataChannel = null;

        this.iceQueue = [];
        this.remoteDescSet = false;

        this.currentChunks = [];
        this.currentFileName = '';
        this.receivedFiles = [];
        this.fileSize = 0;
        this.receivedSize = 0;

        this.offerHandled = false; // 🔥 prevent duplicate handling
    }

    async joinRoom(roomId) {
        try {
            // ✅ Step 1: signaling
            this.signaling = new Signaling(roomId);

// ✅ Step 1: manually check room status
const docSnap = await getDoc(this.signaling.roomRef);

if (!docSnap.exists()) {
    throw new Error("Room not found");
}

const data = docSnap.data();

// 🔥 BLOCK if host not started
if (data.status !== "active") {
    throw new Error("⏳ Host has not started the session yet");
}

console.log("🟢 Receiver joined ACTIVE room");

            console.log("🟢 Receiver joined room");

            // ✅ Step 2: peer connection
            this.pc = new RTCPeerConnection({
                iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
            });

            this.setupPeerConnection();

            // ✅ Step 3: offer listener
            this.signaling.onOffer(async (offer) => {
                if (this.offerHandled) {
                    console.log("⚠️ Offer already handled, skipping...");
                    return;
                }

                try {
                    console.log("📥 Offer received");

                    await this.pc.setRemoteDescription(offer);
                    this.remoteDescSet = true;
                    this.offerHandled = true;

                    // process queued ICE
                    this.iceQueue.forEach(c => this.pc.addIceCandidate(c));
                    this.iceQueue = [];

                    const answer = await this.pc.createAnswer();
                    await this.pc.setLocalDescription(answer);

                    await this.signaling.sendAnswer(answer);

                    console.log("📤 Answer sent");

                } catch (err) {
                    console.error("❌ Offer handling error:", err);
                }
            });

            // ✅ Step 4: ICE handling
            this.signaling.onIceCandidate((candidate) => {
                console.log("📥 ICE received");

                if (this.remoteDescSet) {
                    this.pc.addIceCandidate(new RTCIceCandidate(candidate));
                } else {
                    console.log("⏳ ICE queued");
                    this.iceQueue.push(candidate);
                }
            });

        } catch (err) {
            console.error("❌ Receiver join error:", err);
            throw err;
        }
    }

    setupPeerConnection() {
        // ✅ send ICE
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

        // ✅ receive data channel
        this.pc.ondatachannel = (event) => {
            console.log("📡 Data channel received");

            this.dataChannel = event.channel;

            this.dataChannel.onopen = () => {
                console.log("✅ DataChannel opened (receiver)");
            };

            this.dataChannel.onmessage = (event) => {
                this.handleIncomingData(event.data);
            };
        };
    }

    // ✅ HANDLE FILE DATA
   handleIncomingData(data) {

    if (typeof data === "string") {
        const msg = JSON.parse(data);

        if (msg.type === "fileInfo") {
            console.log("📁 Receiving:", msg.name);

            // ✅ RESET for new file
            this.fileChunks = [];
            this.fileName = msg.name;
            this.fileSize = msg.size;

            // ✅ SHOW NAME IN UI
            const preview = document.getElementById('preview-content');
            if (preview) {
                const p = document.createElement('p');
                p.textContent = `Receiving: ${this.fileName}`;
                preview.appendChild(p);
            }
        }

        if (msg.type === "complete") {
            console.log("✅ File received:", this.fileName);

            this.assembleFile();
        }

    } else {
        // ✅ Binary chunk
        this.fileChunks.push(data);
    }
}
showAllFiles() {
    const preview = document.getElementById('preview-content');
    preview.innerHTML = '';

    this.receivedFiles.forEach(file => {
        const btn = document.createElement('button');
        btn.textContent = `Download ${file.name}`;

        btn.onclick = () => {
            const url = URL.createObjectURL(file.blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            a.click();

            URL.revokeObjectURL(url);
        };

        preview.appendChild(btn);
    });
}

    assembleFile() {
    const blob = new Blob(this.fileChunks);

    console.log("📦 Assembling:", this.fileName, blob.size);

    this.previewFile(blob, this.fileName);
}

    previewFile(blob, fileName) {
        const previewContent = document.getElementById('preview-content');
        if (!previewContent) return;

        previewContent.innerHTML = '';

        const extension = fileName.split('.').pop().toLowerCase();

        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(blob);
            previewContent.appendChild(img);

        } else if (['mp4', 'webm', 'ogg'].includes(extension)) {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(blob);
            video.controls = true;
            previewContent.appendChild(video);

        } else if (extension === 'pdf') {
            const iframe = document.createElement('iframe');
            iframe.src = URL.createObjectURL(blob);
            iframe.style.width = "100%";
            iframe.style.height = "500px";
            previewContent.appendChild(iframe);

        } else if (['txt', 'js', 'py', 'html', 'css'].includes(extension)) {
            blob.text().then(text => {
                const pre = document.createElement('pre');
                pre.textContent = text;
                previewContent.appendChild(pre);
            });

        } else {
            const p = document.createElement('p');
            p.textContent = `File received: ${fileName}`;
            previewContent.appendChild(p);
        }
    }

    downloadFile() {
    if (!this.fileChunks.length) {
        console.warn("⚠️ No file to download");
        return;
    }

    const blob = new Blob(this.fileChunks);
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = this.fileName || "download";
        a.click();

        URL.revokeObjectURL(url);
    }

    async cleanup() {
        console.log("🧹 Receiver cleanup");

        if (this.pc) this.pc.close();
        if (this.signaling) await this.signaling.cleanup();
    }
}