# Speech source clip

`osr_0010_8k.wav` — an 8 kHz recording of Harvard/IEEE sentences from the
**Open Speech Repository** (https://www.voiptroubleshooter.com/open_speech/),
which provides these recordings free of charge for speech-quality testing. The
sentence text is in the public domain.

Used as the clean "Speech" desired-source content in the demo (see
`scripts/build_web_audio.py`, `CONTENTS["speech"]`). If you replace it, keep the
sample rate at 8 kHz mono (or the loader will resample) and update the attribution.
