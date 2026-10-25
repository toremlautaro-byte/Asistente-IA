/* Recorder sessions stay separate from application data and task creation. */
(function(){
  'use strict';
  let host=null,phase='idle',session=null,lastBlob=null,playbackURL=null;
  let meterContext=null,meterTimer=null,timer=null;
  const busy=()=>phase!=='idle';
  const supportedMime=()=>['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus','audio/ogg'].find(t=>window.MediaRecorder?.isTypeSupported?.(t))||'';
  function status(text,kind=''){host.onStatus(text,kind)}
  function controls(){host.onState(phase)}
  function release(capture){
    capture?.stream?.getTracks().forEach(track=>track.stop());
    clearInterval(timer);clearInterval(meterTimer);
    if(meterContext){try{meterContext.close().catch(()=>{})}catch{}meterContext=null}
    host.onMeter(0);
  }
  function meter(stream){
    try{
      const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return;
      meterContext=new AudioContext();
      const source=meterContext.createMediaStreamSource(stream),analyser=meterContext.createAnalyser();
      analyser.fftSize=256;source.connect(analyser);const values=new Uint8Array(analyser.fftSize);
      meterTimer=setInterval(()=>{analyser.getByteTimeDomainData(values);let sum=0;for(const v of values)sum+=((v-128)/128)**2;host.onMeter(Math.min(100,Math.sqrt(sum/values.length)*400))},100);
    }catch{}
  }
  function remember(blob){
    lastBlob=blob;
    if(playbackURL)URL.revokeObjectURL(playbackURL);
    playbackURL=URL.createObjectURL(blob);host.onPlayback(playbackURL);
  }
  async function transcribe(blob){
    phase='transcribing';controls();host.onRetry(false);status('Transcribiendo tu audio…');
    try{
      if(blob.size<128)throw new Error('La grabación quedó vacía. Probá grabar de nuevo.');
      if(blob.size>12*1024*1024)throw new Error('Este audio es demasiado grande. Dividilo en grabaciones más cortas.');
      const result=await host.transcribe(blob);
      const text=typeof result?.transcript==='string'?result.transcript.trim():'';
      if(result?.has_speech!==true||!text||/^\[?(sin voz|sin audio|inaudible)\]?$/i.test(text))throw new Error('No pude distinguir palabras. Podés escuchar el audio y reintentarlo.');
      host.onTranscript(text);
      status(result.uncertain_segments?.length?'Hay una parte poco clara. Revisá el texto antes de enviarlo.':'Audio listo. Revisá el texto y tocá Enviar.','ok');
    }catch(e){
      status(e.message||'No pude transcribir el audio. Tu grabación sigue disponible.','err');
      host.onRetry(true);
    }finally{phase='idle';controls()}
  }
  async function start(){
    if(busy()||!host.canStart())return;
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status('Este navegador no permite grabar acá. Abrí Mentor en Chrome o Safari con una dirección HTTPS.','err');return}
    if(!host.hasKey()){status('Configurá tu clave de Gemini para usar el dictado.','err');host.openSettings();return}
    phase='requesting';controls();status('Activando el micrófono…');
    let capture=null;
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:{ideal:1},echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      const mime=supportedMime();let recorder;
      try{recorder=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:96000})}
      catch{try{recorder=new MediaRecorder(stream,mime?{mimeType:mime}:{})}catch(e){stream.getTracks().forEach(t=>t.stop());throw e}}
      capture={stream,recorder,chunks:[],started:Date.now(),handled:false,error:false};session=capture;
      recorder.ondataavailable=e=>{if(e.data?.size)capture.chunks.push(e.data)};
      recorder.onerror=()=>{capture.error=true;status('La grabación se interrumpió. Intentá de nuevo.','err');stop()};
      recorder.onstop=async()=>{
        if(capture.handled)return;capture.handled=true;release(capture);
        if(capture.error||!capture.chunks.length){phase='idle';controls();if(!capture.error)status('No se grabó audio. Intentá otra vez.','err');return}
        const type=capture.recorder.mimeType||capture.chunks[0]?.type||mime||'audio/webm';
        const blob=new Blob(capture.chunks,{type});remember(blob);await transcribe(blob);
      };
      recorder.start(1000);phase='recording';controls();host.onRetry(false);host.onTimer(0);
      status('Te escucho. Tocá Terminar cuando quieras.');meter(stream);
      timer=setInterval(()=>{const seconds=Math.floor((Date.now()-capture.started)/1000);host.onTimer(seconds);if(seconds>=600)stop()},250);
    }catch(e){
      release(capture);phase='idle';controls();
      status(e.name==='NotAllowedError'?'El micrófono no tiene permiso. Habilitalo en el navegador.':'No pude iniciar la grabación. Revisá el micrófono e intentá otra vez.','err');
    }
  }
  function stop(){
    if(phase!=='recording'||!session)return;
    phase='stopping';controls();status('Preparando tu audio…');
    try{session.recorder.stop()}catch{release(session);phase='idle';controls();status('No pude terminar el audio. Intentá de nuevo.','err')}
  }
  async function retry(){if(busy()||!lastBlob||!host.canStart())return;await transcribe(lastBlob)}
  function init(config){host=config;controls()}
  window.MentorAudio={init,start,stop,retry,isBusy:busy};
})();
