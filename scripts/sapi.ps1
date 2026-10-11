param([Parameter(Mandatory=$true)][string]$Request)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$source = @"
using System;
using System.Collections.Generic;
using System.Speech.Synthesis;
public class WordMark { public double time; public int offset; public int count; public string text; }
public class MouthMark { public double time; public double duration; public int id; }
public class SpeechMarks {
 public string voice; public string culture;
 public List<WordMark> words = new List<WordMark>();
 public List<MouthMark> visemes = new List<MouthMark>();
}
public class AvatarLocalSpeech {
 public static SpeechMarks Make(string text, string path, string requestedVoice, string culture, int rate) {
  var result = new SpeechMarks();
  using (var synth = new SpeechSynthesizer()) {
   string selected = null;
   foreach (var installed in synth.GetInstalledVoices()) {
    var info = installed.VoiceInfo;
    if (!installed.Enabled) continue;
    if (!String.IsNullOrEmpty(requestedVoice) ? info.Name == requestedVoice : info.Culture.Name.Equals(culture, StringComparison.OrdinalIgnoreCase)) {
     selected = info.Name; break;
    }
   }
   if (selected == null) throw new Exception("No installed voice matches " + (String.IsNullOrEmpty(requestedVoice) ? culture : requestedVoice));
   synth.SelectVoice(selected); synth.Rate = rate; synth.Volume = 100;
   result.voice = synth.Voice.Name; result.culture = synth.Voice.Culture.Name;
   synth.SpeakProgress += (s,e) => { lock(result) result.words.Add(new WordMark { time=e.AudioPosition.TotalSeconds, offset=e.CharacterPosition, count=e.CharacterCount, text=e.Text }); };
   synth.VisemeReached += (s,e) => { lock(result) result.visemes.Add(new MouthMark { time=e.AudioPosition.TotalSeconds, duration=e.Duration.TotalSeconds, id=e.Viseme }); };
   synth.SetOutputToWaveFile(path); synth.Speak(text); synth.SetOutputToNull();
  }
  return result;
 }
}
"@
if ($PSVersionTable.PSEdition -eq 'Core') { Add-Type -TypeDefinition $source -ReferencedAssemblies System.Speech,System.Collections }
else { Add-Type -TypeDefinition $source -ReferencedAssemblies System.Speech }
$job = Get-Content -LiteralPath $Request -Raw -Encoding UTF8 | ConvertFrom-Json
$results = @()
foreach ($segment in $job.segments) {
 $marks = [AvatarLocalSpeech]::Make([string]$segment.text, [string]$segment.wav, [string]$job.voice, [string]$job.culture, [int]$job.rate)
 $results += $marks
}
$json = ConvertTo-Json -InputObject @($results) -Depth 8
[System.IO.File]::WriteAllText([string]$job.result, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ('Synthesized ' + $results.Count + ' segments with local speech.')