using System;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Security.Cryptography;

// No number conversions on stack payloads: JsonNode retains the source JsonElement numeric lexemes.
public static class VaultLegacyMerge {
  static readonly JsonSerializerOptions Options=new JsonSerializerOptions{Encoder=System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping};
  const int MaxEntries=2000, MaxEntryBytes=65536, MaxFileBytes=8388608;
  static string S(JsonObject o,string k,int max){if(o[k] is not JsonValue v||!v.TryGetValue<string>(out var s)||s.Length>max)throw new InvalidDataException("无效文本字段："+k);return s;}
  static long N(JsonObject o,string k){if(o[k] is not JsonValue v||!v.TryGetValue<long>(out var n)||n<0)throw new InvalidDataException("无效非负整数："+k);return n;}
  static JsonNode Sorted(JsonNode n){if(n is JsonObject o){var r=new JsonObject();foreach(var kv in o.OrderBy(k=>k.Key,StringComparer.Ordinal))r[kv.Key]=kv.Value==null?null:Sorted(kv.Value);return r;}if(n is JsonArray a){var r=new JsonArray();foreach(var x in a)r.Add(x==null?null:Sorted(x));return r;}return n.DeepClone();}
  static int Bytes(string s)=>Encoding.UTF8.GetByteCount(s);
  public static string Build(string[] paths) {
    var unique=new Dictionary<string,JsonObject>(StringComparer.Ordinal);
    foreach(var path in paths){var file=new FileInfo(path);if(file.Length>MaxFileBytes)throw new InvalidDataException("源文件超过8MiB："+path);
      var root=JsonNode.Parse(File.ReadAllText(path),null,new JsonDocumentOptions{MaxDepth=96}) as JsonObject ?? throw new InvalidDataException("文件必须为JSON对象");
      if(!new long[]{1,2,3}.Contains(N(root,"version"))||root["entries"] is not JsonArray entries||entries.Count>MaxEntries)throw new InvalidDataException("不支持的文件版本/条目数");
      foreach(var value in entries){var e=value?.DeepClone() as JsonObject??throw new InvalidDataException("条目必须为对象");
        string entryId=S(e,"id",36);if(!Guid.TryParseExact(entryId,"D",out var guid)||guid.ToString()!=entryId)throw new InvalidDataException("条目UUID无效");
        S(e,"name",256);S(e,"note",200);N(e,"created");N(e,"updated");if(N(e,"mcDataVersion")>Int32.MaxValue)throw new InvalidDataException("mcDataVersion超出范围");S(e,"modVersion",128);
        if(e["tags"] is not JsonArray tags||tags.Count>8)throw new InvalidDataException("标签超限");
        foreach(var t in tags){if(t is not JsonValue tv||!tv.TryGetValue<string>(out var tag)||String.IsNullOrWhiteSpace(tag)||tag.Length>24)throw new InvalidDataException("无效标签");}
        string kind=e.ContainsKey("kind")?S(e,"kind",16):"item";
        if(kind!="item"&&kind!="entity"&&kind!="block"&&kind!="player_preset")throw new InvalidDataException("未知保险库kind");
        e["kind"]=kind;
        JsonNode payload;
        if(kind=="block"||kind=="player_preset"){
          if(e["template"] is not JsonObject template)throw new InvalidDataException("缺少template");
          ValidateTemplate(kind,template);
          payload=Sorted(template);e.Remove("stack");e.Remove("snbt");
        }else if(kind=="entity"){
          // VaultEntities already canonicalizes stored SNBT; preserve it as typed, opaque text offline.
          string snbt=S(e,"snbt",MaxEntryBytes);
          if(Bytes(snbt)>MaxEntryBytes||!snbt.StartsWith("{")||!snbt.EndsWith("}"))throw new InvalidDataException("无效生物SNBT结构");
          payload=JsonValue.Create(snbt);e.Remove("stack");
        }else{
          if(e["stack"] is not JsonObject stack||stack["comps"] is not JsonObject||stack["removed"] is not JsonObject)throw new InvalidDataException("无效stack结构");
          if(!System.Text.RegularExpressions.Regex.IsMatch(S(stack,"id",256),"^[a-z0-9_.-]+:[a-z0-9_./-]+$"))throw new InvalidDataException("无效物品ID");var count=N(stack,"count");if(count<1||count>99)throw new InvalidDataException("stack数量超限");
          foreach(var key in new[]{"component_snbt","component_formats"})if(stack[key]!=null){if(stack[key] is not JsonObject side)throw new InvalidDataException("无效typed sidecar");foreach(var kv in side)S(side,kv.Key,MaxEntryBytes);}
          payload=Sorted(stack);
        }
        e.Remove("hash");if(Bytes(e.ToJsonString(Options))>MaxEntryBytes)throw new InvalidDataException("条目超过64KiB");
        string digest=kind+":"+Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(payload.ToJsonString(Options))));
        if(!unique.TryGetValue(digest,out var old)){unique[digest]=e;continue;}
        var newest=N(e,"updated")>N(old,"updated")?e:old;var other=ReferenceEquals(newest,e)?old:e;
        var merged=(JsonObject)newest.DeepClone();var union=new List<string>();foreach(var arr in new[]{(JsonArray)newest["tags"],(JsonArray)other["tags"]})foreach(var t in arr){var tag=t.GetValue<string>();if(!union.Contains(tag))union.Add(tag);}
        if(union.Count>8)throw new InvalidDataException("同栈合并后标签超过8个，拒绝丢弃标签");
        var tagArray=new JsonArray();foreach(var tag in union)tagArray.Add(tag);merged["tags"]=tagArray;
        string note=S(newest,"note",200),oldNote=S(other,"note",200);if(note!=oldNote&&oldNote.Length>0)note=String.Join("\n",(note+"\n"+oldNote).Split('\n').Where(line=>line.Length>0).Distinct(StringComparer.Ordinal));
        if(note.Length>200)throw new InvalidDataException("同栈合并后note超过200字符，拒绝截断");merged["note"]=note;merged["created"]=Math.Min(N(e,"created"),N(old,"created"));unique[digest]=merged;
      }
    }
    if(unique.Count>MaxEntries)throw new InvalidDataException("合并超过2000条");
    var names=new HashSet<string>(StringComparer.Ordinal);var ids=new HashSet<string>(StringComparer.Ordinal);var output=new JsonArray();foreach(var e in unique.Values.OrderByDescending(e=>N(e,"updated"))){string id=S(e,"id",36);if(!ids.Add(id)){id=Guid.NewGuid().ToString();e["id"]=id;ids.Add(id);}string name=S(e,"name",256);if(S(e,"kind",16) is "block" or "player_preset"){string original=name;int number=2;while(names.Contains(name)){string suffix=" ("+(number++)+")";int length=Math.Min(original.Length,256-suffix.Length);if(length>0&&Char.IsHighSurrogate(original[length-1]))length--;name=original.Substring(0,length)+suffix;}e["name"]=name;}names.Add(name);if(Bytes(e.ToJsonString(Options))>MaxEntryBytes)throw new InvalidDataException("合并条目超过64KiB");output.Add(e);}
    string result=new JsonObject{["version"]=3,["entries"]=output}.ToJsonString(Options);if(Bytes(result)>MaxFileBytes)throw new InvalidDataException("合并文件超过8MiB");return result;
  }
  static void Keys(JsonObject obj,params string[] keys){foreach(var key in obj.Select(p=>p.Key))if(!keys.Contains(key,StringComparer.Ordinal))throw new InvalidDataException("未知模板字段："+key);}
  static void ValidateTemplate(string kind,JsonObject template){
    if(kind=="block"){
      Keys(template,"block","block_state","snbt");
      if(!System.Text.RegularExpressions.Regex.IsMatch(S(template,"block",256),"^[a-z0-9_.-]+:[a-z0-9_./-]+$"))throw new InvalidDataException("无效方块ID");
      if(template["block_state"] is not JsonObject state)throw new InvalidDataException("缺少方块状态");foreach(var key in state.Select(p=>p.Key))S(state,key,256);
      string snbt=S(template,"snbt",24000);if(!snbt.StartsWith("{")||!snbt.EndsWith("}"))throw new InvalidDataException("无效方块SNBT结构");
      // No offline NBT parser: retain opaque typed text; Minecraft validates before application.
    }else{
      Keys(template,"sections");if(template["sections"] is not JsonObject sections||sections.Count==0)throw new InvalidDataException("预设缺少分区");
      Keys(sections,"inventory","equipment","ender","attributes","effects","game_mode");
      foreach(var pair in sections){
        if(pair.Key=="game_mode"){S(sections,pair.Key,128);continue;}
        if(pair.Key=="attributes"||pair.Key=="effects"){if(pair.Value is not JsonArray)throw new InvalidDataException("属性/效果必须为数组");continue;}
        if(pair.Value is not JsonObject container||container["slots"] is not JsonArray slots)throw new InvalidDataException("容器缺少slots");Keys(container,"slots");var seen=new HashSet<long>();
        foreach(var value in slots){if(value is not JsonObject row||row["stack"] is not JsonObject stack)throw new InvalidDataException("无效容器槽位");Keys(row,"slot","stack");if(!seen.Add(N(row,"slot")))throw new InvalidDataException("槽位重复");if(stack.ContainsKey("empty")){Keys(stack,"empty");if(stack["empty"] is not JsonValue empty||!empty.TryGetValue<bool>(out var b)||!b)throw new InvalidDataException("无效空槽");}else{S(stack,"id",256);N(stack,"count");if(stack["comps"] is not JsonObject||stack["removed"] is not JsonObject)throw new InvalidDataException("无效物品栈");}}
      }
    }
  }
  public static string Merge(string output,string[] paths){
    Directory.CreateDirectory(Path.GetDirectoryName(output));
    using(var held=new FileStream(output+".lock",FileMode.OpenOrCreate,FileAccess.Write,FileShare.ReadWrite)){
      held.Lock(0,long.MaxValue);try{var inputs=paths.ToList();if(File.Exists(output)&&!inputs.Any(p=>String.Equals(Path.GetFullPath(p),Path.GetFullPath(output),StringComparison.OrdinalIgnoreCase)))inputs.Insert(0,output);string text=Build(inputs.ToArray());WriteUnlocked(output,text);return text;}finally{held.Unlock(0,long.MaxValue);}
    }
  }
  public static void Write(string output,string text){
    Directory.CreateDirectory(Path.GetDirectoryName(output));string lockPath=output+".lock";
    using(var held=new FileStream(lockPath,FileMode.OpenOrCreate,FileAccess.Write,FileShare.ReadWrite)){
      held.Lock(0,long.MaxValue);try{
        WriteUnlocked(output,text);
      }finally{held.Unlock(0,long.MaxValue);}
    }
  }
  static void WriteUnlocked(string output,string text){
        string tmp=Path.Combine(Path.GetDirectoryName(output),"vault-merge-"+Guid.NewGuid()+".tmp");
        try{var bytes=Encoding.UTF8.GetBytes(text);using(var target=new FileStream(tmp,FileMode.CreateNew,FileAccess.Write,FileShare.None)){target.Write(bytes);target.Flush(true);}
          if(File.Exists(output)){string bak=output+".bak";string bakTmp=bak+"."+Guid.NewGuid()+".tmp";try{File.Copy(output,bakTmp);File.Move(bakTmp,bak,true);}finally{if(File.Exists(bakTmp))File.Delete(bakTmp);}}
          File.Move(tmp,output,true);
        }finally{if(File.Exists(tmp))File.Delete(tmp);}
  }
}
