var randomPitchRatio = 0
// https://nonbinary.wiki/wiki/Voice_and_speech#:~:text=Several%20studies%20have%20identified%20a,%2C%20Wolfe%20et%20al%201990).
// Several studies have identified a gender-ambiguous average pitch at 155-187Hz, a feminine average pitch at 220Hz, and a masculine average pitch at 120Hz (Adler et al 2006, Andrews 1999, Gelfer et al 2000, Spencer 1998, Wolfe et al 1990).
var median_pitch = 171;

// this class handles the voice changing logic
class Voice {
    constructor(stream, audioCtx) {
        // save the input stream and context
        this.stream = stream
        this.audioCtx = audioCtx ? audioCtx :  new (window.AudioContext || window.webkitAudioContext)();

        // nodes array to store the active audio nodes to be disconnected when the voice changes
        this.nodes = []

        // create the source node and the destination node
        this.source = this.audioCtx.createMediaStreamSource(this.stream);
        this.destination_normal = this.audioCtx.createMediaStreamDestination()
        this.destination_distorted = this.audioCtx.createMediaStreamDestination()

        // ouput stream used for the MediaRecorder to record the output audio after being processsed
        this.audioStream = this.destination_normal.stream
        this.audioStreamChanged = this.destination_distorted.stream

        // audio analyser
        this.spectrum = new Spectrum(this.audioCtx);
        var spectrum = this.spectrum
        setInterval(function () {
            spectrum.render()
        }, 1000 / 20);
    }

    // disconnects all active nodes
    clear_nodes() {
        for (const node of this.nodes) {
            node.disconnect()
        }
        this.nodes = []
    }


    // clear the active nodes and connect the source again
    init(voice_type) {
        this.clear_nodes()
        this.nodes.push(this.source)
        this.voice_type = voice_type
    }


    // pitch shifter voice
    pitch() {
        this.init("changed")

        var validGranSizes = [8, 16, 28, 48, 64, 72],
            grainSize = validGranSizes[2], // controls the gain size
            pitchRatio = 1.5, // pitchRatio will be manipulated by the onaudioprocess function
            overlapRatio = 0.55, // controls the overlap ratio of the buffer
            grainSizeUnmasked = validGranSizes[2],
            pitchRatioUnmasked = 1,
            overlapRatioUnmasked = 0.5,
            failedOnce = false;

        var audioCtx = this.audioCtx

        // create a processor node to manipulate the input buffer
        var pitchShifterProcessor = this.audioCtx.createScriptProcessor(grainSize, 1, 1);
        pitchShifterProcessor.buffer = new Float32Array(grainSize * 2);
        pitchShifterProcessor.grainWindow = hannWindow(grainSize);

        var pitchShifterProcessorUnmasked = this.audioCtx.createScriptProcessor(grainSizeUnmasked, 1, 1);
        pitchShifterProcessorUnmasked.buffer = new Float32Array(grainSizeUnmasked * 2);
        pitchShifterProcessorUnmasked.grainWindow = hannWindow(grainSizeUnmasked);

        // the function that processes the input buffer
        pitchShifterProcessor.onaudioprocess = function (event) {

            var inputData = event.inputBuffer.getChannelData(0);
            var outputData = event.outputBuffer.getChannelData(0);

            // get the pitch of the input buffer from the microphone
            var pitch_freq = autoCorrelate(inputData, audioCtx.sampleRate);

            // get the difference between the input pitch and the target pitch
            // then convert it to a ratio to be applied on the voice
            //pitchRatio = (1 - 0.9*(pitch_freq - median_pitch) / median_pitch)
            pitchRatio = median_pitch/pitch_freq

            // check if the ratio exceeds the bounds of the algorithm
            if (pitchRatio < 0.5) {
                pitchRatio = 0.5
            } else if (pitchRatio > 2) {
                pitchRatio = 2
            }



            //////////////////////////////////
            // Attempt at using the vocoder //

            // // 1. Create a sine wave for a 200Hz note (can be changed to any other frequency)
            // const REAL_TIME_FREQUENCY = 200;
            // const ANGULAR_FREQUENCY = REAL_TIME_FREQUENCY * 2 * Math.PI;

            // // apply the frequency to a new buffer
            // let myBuffer = audioCtx.createBuffer(1, inputData.length, 44100);
            // let myArray = myBuffer.getChannelData(0);
            // function generateSample(sampleNumber) {
            //     let sampleTime = sampleNumber / 44100;
            //     let sampleAngle = sampleTime * ANGULAR_FREQUENCY;
            //     return Math.sin(sampleAngle);
            // }
            // for (let sampleNumber = 0; sampleNumber < 88200; sampleNumber++) {
            //     myArray[sampleNumber] = generateSample(sampleNumber);
            // }

            // // 2. create the vocoder with the input buffer and the chenerated buffer
            // try {
            //     // i used a try catch because the creation of the vocoder fails due to an error in the vocoder algorithm itself
            //     if(!failedOnce){
            //         // params: audio context, carrier (fake voice input signal), modulator (real voice input signal)
            //         let v = vocoder(audioCtx, myBuffer, inputData);
            //     }
            // } catch (error) {
            //     failedOnce = true
            //     console.error(error);
            // }

            // End of attempt at using the vocoder //
            /////////////////////////////////////////




            ////////////////////////////////////
            // start pitch shifting algorithm //
            for (i = 0; i < inputData.length; i++) {

                // Apply the window to the input buffer
                inputData[i] *= this.grainWindow[i];

                // Shift half of the buffer
                this.buffer[i] = this.buffer[i + grainSize];

                // Empty the buffer tail
                this.buffer[i + grainSize] = 0.0;
            }

            // Calculate the pitch shifted grain re-sampling and looping the input
            var grainData = new Float32Array(grainSize * 2);
            if (Math.floor(audioCtx.currentTime * 1000) % 60 == 0) {
                randomPitchRatio = Math.random() * 0.3;
            }

            let pitch_move = pitchRatio + randomPitchRatio
            if (pitch_move < 0.5) {
                pitch_move = 0.5
            } else if (pitch_move > 2) {
                pitch_move = 2
            }


            for (var i = 0, j = 0.0;
                i < grainSize;
                i++, j += pitch_move) {

                var index = Math.floor(j) % grainSize;
                var a = inputData[index];
                var b = inputData[(index + 1) % grainSize];
                grainData[i] += linearInterpolation(a, b, j % 1.0) * this.grainWindow[i];
            }

            // Copy the grain multiple times overlapping it
            for (i = 0; i < grainSize; i += Math.round(grainSize * (1 - overlapRatio))) {
                for (j = 0; j <= grainSize; j++) {
                    this.buffer[i + j] += grainData[j];
                }
            }

            // Output the first half of the buffer
            for (i = 0; i < grainSize; i++) {
                outputData[i] = this.buffer[i];
            }

            // end of the pitch shifting algorithm //
            /////////////////////////////////////////

        };

        pitchShifterProcessorUnmasked.onaudioprocess = function (event) {

            var inputData = event.inputBuffer.getChannelData(0);
            var outputData = event.outputBuffer.getChannelData(0);

            ////////////////////////////////////
            // start pitch shifting algorithm //
            for (i = 0; i < inputData.length; i++) {

                // Apply the window to the input buffer
                inputData[i] *= this.grainWindow[i];

                // Shift half of the buffer
                this.buffer[i] = this.buffer[i + grainSizeUnmasked];

                // Empty the buffer tail
                this.buffer[i + grainSizeUnmasked] = 0.0;
            }

            // Calculate the pitch shifted grain re-sampling and looping the input
            var grainData = new Float32Array(grainSizeUnmasked * 2);
            if (Math.floor(audioCtx.currentTime * 1000) % 60 == 0) {
                randomPitchRatio = Math.random() * 0.3;
            }

            let pitch_move = pitchRatioUnmasked + randomPitchRatio
            if (pitch_move < 0.5) {
                pitch_move = 0.5
            } else if (pitch_move > 2) {
                pitch_move = 2
            }

            for (var i = 0, j = 0.0;
                i < grainSizeUnmasked;
                i++, j += pitch_move) {

                var index = Math.floor(j) % grainSizeUnmasked;
                var a = inputData[index];
                var b = inputData[(index + 1) % grainSizeUnmasked];
                grainData[i] += linearInterpolation(a, b, j % 1.0) * this.grainWindow[i];
            }

            // Copy the grain multiple times overlapping it
            for (i = 0; i < grainSizeUnmasked; i += Math.round(grainSizeUnmasked * (1 - overlapRatioUnmasked))) {
                for (j = 0; j <= grainSizeUnmasked; j++) {
                    this.buffer[i + j] += grainData[j];
                }
            }

            // Output the first half of the buffer
            for (i = 0; i < grainSizeUnmasked; i++) {
                outputData[i] = this.buffer[i];
            }

            // end of the pitch shifting algorithm //
            /////////////////////////////////////////

        };

        // Create the gain node
        var gainNode = this.audioCtx.createGain();
        gainNode.gain.setValueAtTime(1.5, this.audioCtx.currentTime);

        var gainNodeUnmasked = this.audioCtx.createGain();
        gainNodeUnmasked.gain.setValueAtTime(1.5, this.audioCtx.currentTime);

        // Create the oscillator node (currently not used) (it applies additional effects on the voice)
        let osc = this.audioCtx.createOscillator();
        osc.frequency.value = 1000;
        osc.type = 'sine';

        // add some delay (useful when we use the oscillator node)
        let delay = this.audioCtx.createDelay();
        delay.delayTime.value = 0.0001;

        // append the nodes to the nodes array to be able to disconnect them later
        this.nodes.push(osc)
        this.nodes.push(pitchShifterProcessor)
        this.nodes.push(gainNode)
        this.nodes.push(delay)

        // Connect the nodes to each other and to the outputs
        //                                                     -> Context Output (headphones)
        // current graph: Source -> Delay -> Processor -> Gain -> Analyser
        //                                                     -> Destination Node Output (for the recording)


        this.source.connect(delay);
        this.source.connect(this.destination_normal);

        // osc.connect(delay.delayTime);
        // osc.start()

        delay.connect(pitchShifterProcessor);
        delay.connect(pitchShifterProcessorUnmasked);
        pitchShifterProcessor.connect(gainNode);
        pitchShifterProcessorUnmasked.connect(gainNodeUnmasked);
        gainNode.connect(this.audioCtx.destination);
        gainNode.connect(this.destination_distorted);
        gainNodeUnmasked.connect(this.destination_normal);
        gainNode.connect(this.spectrum.spectrumAudioAnalyser);

        // set the color of the canvas
        this.spectrum.setBarColor("white")


    }


    // alien robot voice (very bad)
    alien() {
        this.init("changed")
        let oscillator = this.audioCtx.createOscillator();
        oscillator.frequency.value = 40;
        oscillator.type = 'sine';
        this.nodes.push(oscillator)

        let oscillatorGain = this.audioCtx.createGain();
        oscillatorGain.gain.value = 0.05;
        this.nodes.push(oscillatorGain)

        let delay = this.audioCtx.createDelay();
        delay.delayTime.value = 0.05;
        this.nodes.push(delay)

        this.source.connect(delay);
        delay.connect(this.destination_normal);
        delay.connect(this.audioCtx.destination);

        oscillator.connect(oscillatorGain);
        oscillatorGain.connect(delay.delayTime);


        oscillator.start(0);
    }


    // normal voice
    normal() {
        this.init("normal")

       var validGranSizes = [256, 512, 1024, 2048, 4096, 8192],
            grainSize = validGranSizes[2], // controls the gain size
            pitchRatio = 1, // pitchRatio will be manipulated by the onaudioprocess function
            overlapRatio = 0.5, // controls the overlap ratio of the buffer
            failedOnce = false;

        var audioCtx = this.audioCtx

        // create a processor node to manipulate the input buffer
        var pitchShifterProcessor = this.audioCtx.createScriptProcessor(grainSize, 1, 1);
        pitchShifterProcessor.buffer = new Float32Array(grainSize * 2);
        pitchShifterProcessor.grainWindow = hannWindow(grainSize);

        // the function that processes the input buffer
        pitchShifterProcessor.onaudioprocess = function (event) {

            var inputData = event.inputBuffer.getChannelData(0);
            var outputData = event.outputBuffer.getChannelData(0);

            // get the pitch of the input buffer from the microphone
            //var pitch_freq = autoCorrelate(inputData, audioCtx.sampleRate);

            // get the difference between the input pitch and the target pitch
            // then convert it to a ratio to be applied on the voice
            //pitchRatio = (1 - 0.9*(pitch_freq - median_pitch) / median_pitch)

            // check if the ratio exceeds the bounds of the algorithm
            //if (pitchRatio < 0.5) {
            //    pitchRatio = 0.5
            //} else if (pitchRatio > 2) {
            //    pitchRatio = 2
            //}



            //////////////////////////////////
            // Attempt at using the vocoder //

            // // 1. Create a sine wave for a 200Hz note (can be changed to any other frequency)
            // const REAL_TIME_FREQUENCY = 200;
            // const ANGULAR_FREQUENCY = REAL_TIME_FREQUENCY * 2 * Math.PI;

            // // apply the frequency to a new buffer
            // let myBuffer = audioCtx.createBuffer(1, inputData.length, 44100);
            // let myArray = myBuffer.getChannelData(0);
            // function generateSample(sampleNumber) {
            //     let sampleTime = sampleNumber / 44100;
            //     let sampleAngle = sampleTime * ANGULAR_FREQUENCY;
            //     return Math.sin(sampleAngle);
            // }
            // for (let sampleNumber = 0; sampleNumber < 88200; sampleNumber++) {
            //     myArray[sampleNumber] = generateSample(sampleNumber);
            // }

            // // 2. create the vocoder with the input buffer and the chenerated buffer
            // try {
            //     // i used a try catch because the creation of the vocoder fails due to an error in the vocoder algorithm itself
            //     if(!failedOnce){
            //         // params: audio context, carrier (fake voice input signal), modulator (real voice input signal)
            //         let v = vocoder(audioCtx, myBuffer, inputData);
            //     }
            // } catch (error) {
            //     failedOnce = true
            //     console.error(error);
            // }

            // End of attempt at using the vocoder //
            /////////////////////////////////////////




            ////////////////////////////////////
            // start pitch shifting algorithm //
            for (i = 0; i < inputData.length; i++) {

                // Apply the window to the input buffer
                inputData[i] *= this.grainWindow[i];

                // Shift half of the buffer
                this.buffer[i] = this.buffer[i + grainSize];

                // Empty the buffer tail
                this.buffer[i + grainSize] = 0.0;
            }

            // Calculate the pitch shifted grain re-sampling and looping the input
            var grainData = new Float32Array(grainSize * 2);
            if (Math.floor(audioCtx.currentTime * 1000) % 60 == 0) {
                randomPitchRatio = Math.random() * 0.3;
            }

            let pitch_move = pitchRatio + randomPitchRatio
            if (pitch_move < 0.5) {
                pitch_move = 0.5
            } else if (pitch_move > 2) {
                pitch_move = 2
            }


            for (var i = 0, j = 0.0;
                i < grainSize;
                i++, j += pitch_move) {

                var index = Math.floor(j) % grainSize;
                var a = inputData[index];
                var b = inputData[(index + 1) % grainSize];
                grainData[i] += linearInterpolation(a, b, j % 1.0) * this.grainWindow[i];
            }

            // Copy the grain multiple times overlapping it
            for (i = 0; i < grainSize; i += Math.round(grainSize * (1 - overlapRatio))) {
                for (j = 0; j <= grainSize; j++) {
                    this.buffer[i + j] += grainData[j];
                }
            }

            // Output the first half of the buffer
            for (i = 0; i < grainSize; i++) {
                outputData[i] = this.buffer[i];
            }

            // end of the pitch shifting algorithm //
            /////////////////////////////////////////

        };

        // Create the gain node
        var gainNode = this.audioCtx.createGain();
        gainNode.gain.setValueAtTime(1.5, this.audioCtx.currentTime);

        // Create the oscillator node (currently not used) (it applies additional effects on the voice)
        let osc = this.audioCtx.createOscillator();
        osc.frequency.value = 1000;
        osc.type = 'sine';

        // add some delay (useful when we use the oscillator node)
        let delay = this.audioCtx.createDelay();
        delay.delayTime.value = 0.0001;

        // append the nodes to the nodes array to be able to disconnect them later
        this.nodes.push(osc)
        this.nodes.push(pitchShifterProcessor)
        this.nodes.push(gainNode)
        this.nodes.push(delay)

        // Connect the nodes to each other and to the outputs
        //                                                     -> Context Output (headphones)
        // current graph: Source -> Delay -> Processor -> Gain -> Analyser
        //                                                     -> Destination Node Output (for the recording)


        this.source.connect(delay);
        this.source.connect(this.destination_normal);

        // osc.connect(delay.delayTime);
        // osc.start()

        delay.connect(pitchShifterProcessor);
        pitchShifterProcessor.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);
        gainNode.connect(this.destination_distorted);
        gainNode.connect(this.destination_normal);
        gainNode.connect(this.spectrum.spectrumAudioAnalyser);

        // set the color of the canvas
        this.spectrum.setBarColor("white")

        /*var biquadFilter = this.audioCtx.createBiquadFilter();
        biquadFilter.type = "lowshelf";
        this.nodes.push(biquadFilter)

        this.source.connect(biquadFilter);
        biquadFilter.connect(this.spectrum.spectrumAudioAnalyser);
        biquadFilter.connect(this.audioCtx.destination);
        biquadFilter.connect(this.destination_normal);

        this.spectrum.setBarColor("dark")*/
    }
}
