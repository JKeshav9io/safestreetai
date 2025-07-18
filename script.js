const URL = "https://teachablemachine.withgoogle.com/models/_QnYngEJh/";
let recognizer;
let isListening = false;
let lastAlertLabel = "";

// Ask permission for FCM when page loads
window.onload = () => {
  if (typeof requestNotificationPermission === 'function') {
    requestNotificationPermission();
  }
};

async function createModel() {
  const checkpointURL = URL + "model.json";
  const metadataURL = URL + "metadata.json";
  recognizer = speechCommands.create("BROWSER_FFT", undefined, checkpointURL, metadataURL);
  await recognizer.ensureModelLoaded();
}

function resetUI() {
  document.getElementById("status").innerText = "";
  document.getElementById("status").style.opacity = '0';
  document.getElementById("label-container").innerHTML = "";
  const ctx = document.getElementById("spectrogram").getContext("2d");
  ctx.clearRect(0, 0, 380, 100);
  lastAlertLabel = "";
}

async function toggleDetection() {
  const button = document.getElementById("toggleButton");

  if (!recognizer) await createModel();

  if (!isListening) {
    startListening();
    button.innerText = "Stop Detection";
    isListening = true;
  } else {
    recognizer.stopListening();
    resetUI();
    button.innerText = "Start Detection";
    isListening = false;
  }
}

function startListening() {
  const classLabels = recognizer.wordLabels();
  const labelContainer = document.getElementById("label-container");
  const canvas = document.getElementById("spectrogram");
  const ctx = canvas.getContext("2d");
  const status = document.getElementById("status");

  labelContainer.innerHTML = "";
  for (let i = 0; i < classLabels.length; i++) {
    const div = document.createElement("div");
    div.id = `label-${i}`;
    labelContainer.appendChild(div);
  }

  recognizer.listen(result => {
    const scores = result.scores;
    const { data, frameSize } = result.spectrogram;
    const timeSteps = data.length / frameSize;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let t = 0; t < timeSteps; t++) {
      for (let f = 0; f < frameSize; f++) {
        const val = data[t * frameSize + f];
        const color = Math.floor((val + 1) * 127.5);
        ctx.fillStyle = `rgb(${color}, ${color}, ${color})`;
        ctx.fillRect(t, canvas.height - f, 1, 1);
      }
    }

    let maxScore = 0;
    let maxIndex = -1;
    for (let i = 0; i < classLabels.length; i++) {
      const confidence = scores[i];
      const div = document.getElementById(`label-${i}`);
      div.innerText = `${classLabels[i]}: ${confidence.toFixed(2)}`;
      const colorVal = Math.floor(confidence * 255);
      div.style.backgroundColor = `rgba(${255 - colorVal}, ${colorVal}, 100, 0.3)`;
      div.style.fontWeight = 'normal';

      if (confidence > maxScore) {
        maxScore = confidence;
        maxIndex = i;
      }
    }

    // Highlight top label
    if (maxIndex !== -1) {
      const highlightDiv = document.getElementById(`label-${maxIndex}`);
      if (highlightDiv) {
        highlightDiv.style.backgroundColor = `rgba(0, 255, 150, 0.5)`;
        highlightDiv.style.fontWeight = 'bold';
      }
    }

    const alerts = ['Distress Screams', 'Traffic Collision', 'Explosion or Gunshot'];
    const detectedLabel = classLabels[maxIndex];

    if (maxScore > 0.75 && alerts.includes(detectedLabel)) {
      if (detectedLabel !== lastAlertLabel) {
        lastAlertLabel = detectedLabel;
        sendPushNotification(detectedLabel);
      }
      status.innerText = `🚨 Alert: ${detectedLabel} detected!`;
      status.style.opacity = '1';
    }

    if ((!alerts.includes(detectedLabel) || maxScore < 0.75) && lastAlertLabel !== "") {
      lastAlertLabel = "";
      status.innerText = "";
      status.style.opacity = '0';
    }

  }, {
    includeSpectrogram: true,
    probabilityThreshold: 0.5,
    invokeCallbackOnNoiseAndUnknown: true,
    overlapFactor: 0.5
  });
}

function sendPushNotification(label) {
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(async position => {
    const { latitude, longitude } = position.coords;

    await fetch("http://localhost:8000/send-notification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        label,
        location: { latitude, longitude }
      })
    });
  });
}
