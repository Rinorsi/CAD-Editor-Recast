// Execute the production indentation planner directly with JDK 25; no Gradle lock or game process.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
const out = fs.mkdtempSync(path.join(os.tmpdir(),'editor-code-indent-'));
const source = path.join(root,'common/src/main/java/dev/rinorsi/editor/client/CodeIndent.java');
const harness = path.join(out,'CodeIndentAcceptance.java');
fs.writeFileSync(harness, [
  'package dev.rinorsi.editor.client;',
  'public final class CodeIndentAcceptance {',
  'static void check(String input,int from,int to,boolean outdent,String expected,int start,int end) {',
  'var edit=CodeIndent.plan(input,from,to,outdent);',
  'String got=edit==null?input:input.substring(0,edit.from())+edit.text()+input.substring(edit.to());',
  'if(!got.equals(expected))throw new AssertionError("text: "+got+" != "+expected);',
  'if(edit!=null&&(edit.selectionStart()!=start||edit.selectionEnd()!=end))',
  'throw new AssertionError("selection: "+edit.selectionStart()+":"+edit.selectionEnd()+" != "+start+":"+end);',
  '}',
  'public static void main(String[] args) {',
  String.raw`check("abc",1,1,false,"a  bc",3,3);`,
  String.raw`check("a\nb\nc",0,5,false,"  a\n  b\n  c",2,11);`,
  String.raw`check("a\nb\nc",0,2,false,"  a\nb\nc",2,4);`,
  String.raw`check("  a\n b\n\tc",0,10,true,"a\nb\nc",0,5);`,
  String.raw`check("  abc",1,1,true,"abc",0,0);`,
  String.raw`check("  abc",4,4,true,"abc",2,2);`,
  String.raw`check("\talpha\n beta",2,10,true,"alpha\nbeta",1,8);`,
  String.raw`check("",0,0,true,"",0,0);`,
  String.raw`check("abc",0,3,true,"abc",0,3);`,
  String.raw`check("a\n",0,2,false,"  a\n",2,4);`,
  String.raw`check("a\n",2,2,false,"a\n  ",4,4);`,
  'System.out.println("PASS native code indent: caret, multiline selection, exclusive line end, mixed tabs/spaces, empty/trailing lines and selection mapping.");',
  '}}'
].join(String.fromCharCode(10)));
const bundled=path.join(os.homedir(),'.jdks/jdk-25.0.5+8/bin');
const exe=name=>process.platform==='win32'&&fs.existsSync(path.join(bundled,name+'.exe'))?path.join(bundled,name+'.exe'):name;
for(const [name,args] of [['javac',['-encoding','UTF-8','-d',out,source,harness]],['java',['-cp',out,'dev.rinorsi.editor.client.CodeIndentAcceptance']]]) {
  const r=spawnSync(exe(name),args,{encoding:'utf8'});
  process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');
  if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);
}
