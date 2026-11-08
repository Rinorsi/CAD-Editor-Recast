package dev.rinorsi.editor.client;

/** Pure priority decision. Hit describes the one vanilla hit result within reach. */
public final class EditDispatch {
    private EditDispatch() {}
    public enum Hit { NONE, ENTITY, BLOCK_ENTITY, BLOCK_STATE }
    public enum Action { ITEM, SELF, ENTITY, BLOCK }
    public static Action decide(boolean hoveredItem,boolean shift,Hit hit,boolean mainHandEmpty) {
        if(hoveredItem)return Action.ITEM;
        if(shift)return mainHandEmpty?Action.SELF:Action.ITEM;
        if(hit==Hit.ENTITY)return Action.ENTITY;
        if(hit==Hit.BLOCK_ENTITY)return Action.BLOCK;
        if(!mainHandEmpty)return Action.ITEM;
        if(hit==Hit.BLOCK_STATE)return Action.BLOCK;
        return Action.SELF;
    }
}
