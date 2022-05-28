var voice;
var context;
var recording = false;
var recorder;
var changerActivated = false;

// check for microphone permissions
if (navigator.mediaDevices) {
  console.log('getUserMedia supported.');

  // get the microphone input whcih resolves to the microphone stream
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(async function (stream) {
      // show the page and hide the error message saying "allow microphone"
      $("#page-content").show()
      $("#allow-text").hide()

      // create the voice object. This object holds the logic of the clear and distorted voices
      voice = new Voice(stream)

      // initialize it with the normal voice
      voice.normal()

      // create the voice recorder (used upon pressing the record button)
      recorder_normal = await recordAudio(voice.audioStream);
      recorder_distorted = await recordAudio(voice.audioStreamChanged);

    })
    .catch(function (err) {
      console.log('An error occurred: ' + err);
      $("#page-content").hide()
      $("#allow-text").show()
    });
} else {
  console.log('getUserMedia not supported on your browser!');
}



// record event listener
$("#record_button").click(async function () {
  // check if we're already recording
  if (recording) {
    // update the UI
    $(this).removeClass('danger-btn').addClass('btn-pink').find('i').removeClass('fa-stop').addClass('fa-circle')
    $(".changer_btn").prop('disabled', false)

    // stop the recording and get the resulting audio
    var audio1 = await recorder_normal.stop();
    var audio2 = voice.voice_type == "changed" ? await recorder_distorted.stop() : null;

    // send the recorded audio arrayBuffer to the download function
    audio2 ? decodeAndDownload(await audio2.audioBlob.arrayBuffer(), "masked") : ''
    audio1 ? decodeAndDownload(await audio1.audioBlob.arrayBuffer(), "unmasked") : ''
  } else {
    // update the UI
    $(this).removeClass('btn-pink').addClass('danger-btn').find('i').removeClass('fa-circle').addClass('fa-stop')
    $(".changer_btn").prop('disabled', true)

    // start the recording
    recorder_normal.start();
    voice.voice_type == "changed" ? recorder_distorted.start() : '';
  }
  recording = !recording;
})


// toggle the normal and distorted voice event listener
$(".changer_btn").click(function () {
  if (voice) {
    $('.sticker').hide()
    if ($(this).attr('id') == "normal_changer_btn") {
      // change the voice to normal
      voice.normal()

      // UI update
      $("#voice_text").text("Normal voice selected")
      $("#voice-sticker-normal").show()
    } else {
      // change the voice to distorted
      voice.pitch("high")

      // UI update
      $("#voice_text").text("Distorted voice selected")
      $("#voice-sticker-high").show()
    }
    changerActivated = !changerActivated;
  }
})
