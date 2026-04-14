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
        this.receivedFiles = []; // ✅ store all files
        this.currentFileChunks = []; // ✅ temp buffer
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

    renderFileList() {
    const panel = document.getElementById('file-list-panel');
const container = document.getElementById('file-list');
    if (!panel || !container) return;

    panel.classList.remove('hidden');
    container.innerHTML = '';

    this.receivedFiles.forEach((file, index) => {

        const item = document.createElement('div');
        item.className = "file-item";

        item.innerHTML = `
            <div class="file-name">${file.name}</div>
            <div class="file-meta">${(file.blob.size / 1024).toFixed(2)} KB</div>
        `;

        item.onclick = () => this.openFileMenu(index);

        container.appendChild(item);
    });
}

    // ✅ HANDLE FILE DATA
   handleIncomingData(data) {

    if (typeof data === "string") {
        const msg = JSON.parse(data);

        if (msg.type === "fileInfo") {
            console.log("📁 Receiving:", msg.name);

            this.currentFileChunks = []; // reset buffer
            this.fileName = msg.name;
        }

        if (msg.type === "complete") {
const extension = this.fileName.split('.').pop().toLowerCase();

let mimeType = "application/octet-stream";

if (extension === "pdf") mimeType = "application/pdf";
else if (["jpg","jpeg"].includes(extension)) mimeType = "image/jpeg";
else if (extension === "png") mimeType = "image/png";
else if (extension === "mp4") mimeType = "video/mp4";
else if (extension === "txt") mimeType = "text/plain";

const blob = new Blob(this.currentFileChunks, { type: mimeType });    this.receivedFiles.push({
        name: this.fileName,
        blob: blob
    });

    this.renderFileList(); // 🔥 IMPORTANT
}
if (msg.type === "allComplete") {
    console.log("🎉 All files received");

    // (Optional) show UI message
    alert("All files received successfully!");
}

    } else {
    if (data instanceof ArrayBuffer) {
        this.currentFileChunks.push(data);
    } else {
        console.warn("⚠️ Non-binary chunk received, skipping");
    }
}
}

openFileMenu(index) {
    const file = this.receivedFiles[index];

    const modal = document.createElement('div');
    modal.className = "modal";

    modal.innerHTML = `
        <div class="modal-content">
            <h3>${file.name}</h3>

            <div id="modal-actions">
                <button id="preview-btn">Preview</button>
                <button id="download-btn">Download</button>
                <button id="close-btn">Close</button>
            </div>

            <div id="modal-preview" class="hidden"></div>
        </div>
    `;

    document.body.appendChild(modal);

    const previewBox = modal.querySelector('#modal-preview');
    const actions = modal.querySelector('#modal-actions');

    // ✅ PREVIEW
    modal.querySelector('#preview-btn').onclick = () => {
        actions.style.display = "none";
        previewBox.classList.remove('hidden');

        this.previewInsideModal(file.blob, file.name, previewBox, actions);
    };

    // ✅ DOWNLOAD
    modal.querySelector('#download-btn').onclick = () => {
        this.downloadSpecificFile(file);
    };

    // ✅ CLOSE
    modal.querySelector('#close-btn').onclick = () => {
        
        modal.remove();
    };
}

previewInsideModal(blob, fileName, previewBox, actions) {
   previewBox.innerHTML = '';


const extension = fileName.split('.').pop().trim().toLowerCase();
console.log("EXT:", extension);
    try {

        // 🖼️ IMAGE
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(blob);
            img.style.maxWidth = "100%";
            img.style.maxHeight = "70vh";
            img.style.objectFit = "contain";
            previewBox.appendChild(img);
        }

        // 🎥 VIDEO
        else if (['mp4', 'webm', 'ogg'].includes(extension)) {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(blob);
            video.controls = true;
            video.style.maxWidth = "100%";
            video.style.maxHeight = "70vh";
            previewBox.appendChild(video);
        }

        // 📄 PDF
       else if (extension === 'pdf') {
    const url = URL.createObjectURL(blob);

    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.style.width = "100%";
    iframe.style.height = "80vh";
    iframe.style.border = "none";
    
    previewBox.appendChild(iframe);
}

        // 📜 TEXT
        else if (['txt', 'js', 'py', 'html', 'css'].includes(extension)) {
            blob.text().then(text => {
                const pre = document.createElement('pre');
                pre.textContent = text;
                pre.style.whiteSpace = "pre-wrap";
                pre.style.wordBreak = "break-word";
                previewBox.appendChild(pre);
            });
        }

        // ❌ UNSUPPORTED
        else {
            previewBox.innerHTML = `
                <div style="color:red; text-align:center; font-size:18px;">
                    ⚠️ Preview not supported
                </div>
            `;
        }

    } catch (err) {
        console.error("Preview error:", err);
        previewBox.innerHTML = `
            <div style="color:red; text-align:center; font-size:18px;">
                ⚠️ Preview failed
            </div>
        `;
    }

    // 🔥 ADD BACK BUTTON INSIDE MODAL
    const backBtn = document.createElement('button');
    backBtn.textContent = "⬅ Back";
    backBtn.style.marginTop = "10px";

    backBtn.onclick = () => {
        previewBox.classList.add('hidden');
        actions.style.display = "block";
    };

    previewBox.appendChild(backBtn);
}
 

downloadSpecificFile(file) {
    const url = URL.createObjectURL(file.blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();

    URL.revokeObjectURL(url);
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

    }