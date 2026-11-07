package dev.rinorsi.editor.registry.search;

import java.util.*;

/** Compact immutable row payload: shared bounded schemas and one values array, no node per field. */
public final class RowFields extends AbstractMap<String,Object> {
    private static final Map<List<String>,String[]> SCHEMAS=new LinkedHashMap<>();
    private final String[] keys;
    private final Object[] values;
    public RowFields(Map<String,Object> source){
        List<String> schema=List.copyOf(source.keySet());
        synchronized(SCHEMAS){String[] known=SCHEMAS.get(schema);if(known==null){known=schema.toArray(String[]::new);if(SCHEMAS.size()<64)SCHEMAS.put(schema,known);}keys=known;}
        values=new Object[keys.length];for(int i=0;i<keys.length;i++)values[i]=Objects.requireNonNull(source.get(keys[i]));
    }
    @Override public int size(){return keys.length;}
    @Override public Object get(Object key){for(int i=0;i<keys.length;i++)if(keys[i].equals(key))return values[i];return null;}
    @Override public Set<Entry<String,Object>> entrySet(){return new AbstractSet<>(){
        public int size(){return keys.length;}
        public Iterator<Entry<String,Object>> iterator(){return new Iterator<>(){int position;public boolean hasNext(){return position<keys.length;}public Entry<String,Object> next(){if(!hasNext())throw new NoSuchElementException();int i=position++;return new SimpleImmutableEntry<>(keys[i],values[i]);}};}
    };}
}
