// worker.js (SENDER ONLY - FIXED)

let file = null;
let chunkSize = 64 * 1024;
let offset = 0;

self.onmessage = async function(event) {
    const { type, data } = event.data;

    if (type === 'startTransfer') {
        file = data;
        offset = 0;
        sendFileInfo();
        sendNextChunk();
    }
};

function sendFileInfo() {
    self.postMessage({
        type: 'fileInfo',
        name: file.name,
        size: file.size
    });
}

async function sendNextChunk() {
    if (offset >= file.size) {
        self.postMessage({ type: 'complete' });
        return;
    }

    const chunk = file.slice(offset, offset + chunkSize);
    const buffer = await chunk.arrayBuffer();

    offset += buffer.byteLength;

    self.postMessage({
        type: 'chunk',
        buffer,
        progress: (offset / file.size) * 100
    });
}

// For receiver side 
let receivedChunks = []; 
let expectedSize = 0;
 let receivedSize = 0;
  function handleReceiverMessage(event)
   { if (typeof event.data === 'string') { 
    const message = JSON.parse(event.data); 
    if (message.type === 'fileInfo') 
        { expectedSize = message.size; 
            console.log('Received file info:', message.name, message.size); 
            self.postMessage({ type: 'fileInfo', name: message.name, size: message.size }); } } 
            else { // Binary data (chunk)
             receivedChunks.push(event.data); receivedSize += event.data.byteLength; 
             console.log(Received chunk, total received: ${receivedSize}/${expectedSize}); 
             self.postMessage({ type: 'chunk', chunk: event.data });
              // Send ack to allow more chunks
               dataChannel.send(JSON.stringify({ type: 'ack' }));
                if (receivedSize >= expectedSize) 
                    { console.log('File transfer complete'); self.postMessage({ type: 'complete' });
             }
             }
             } // Set the message handler for receiver
              if (self.location.search.includes('receiver')) 
                { self.onmessage = function(event) { const { type, data } = event.data; 
              if (type === 'init')
                 { dataChannel = data; dataChannel.onmessage = handleReceiverMessage; 
                dataChannel.onclose = () => self.postMessage({ type: 'closed' });
                dataChannel.onerror = (error) => self.postMessage({ type: 'error', error }); } };
             }