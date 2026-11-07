package dev.rinorsi.editor.client;

import java.util.ArrayList;
import java.util.List;
import dev.rinorsi.editor.client.VaultButtonLayout.Box;

public final class VaultButtonLayoutTest {
    public static void main(String[] args) {
        int checks = 0;
        for (int[] resolution : List.of(new int[]{854,480}, new int[]{1280,720}, new int[]{1920,1080}, new int[]{3840,2160})) {
            for (int scale = 1; scale <= 4; scale++) {
                int effective = Math.min(scale, Math.max(1, Math.min(resolution[0] / 320, resolution[1] / 240)));
                int width = (resolution[0] + effective - 1) / effective;
                int height = (resolution[1] + effective - 1) / effective;
                for (boolean pause : List.of(false, true)) {
                    var occupied = new ArrayList<Box>();
                    for (int row = 0; row < (pause ? 6 : 4); row++) occupied.add(new Box(width/2-100,height/4+48+24*row,200,20));
                    occupied.add(new Box(width/2-124,height/4+144,20,20));
                    occupied.add(new Box(width/2+104,height/4+144,20,20));
                    // Simulate another mod taking our preferred corner, then adding another control later.
                    occupied.add(new Box(width-90,4,86,20));
                    for (int added = 0; added < 3; added++) {
                        Box box = VaultButtonLayout.place(width,height,60,occupied);
                        if (box == null || box.x() < 4 || box.y() < 4 || box.x()+box.width() > width-4
                                || box.y()+box.height() > height-32 || occupied.stream().anyMatch(box::overlaps))
                            throw new AssertionError("layout "+resolution[0]+"x"+resolution[1]+" scale="+scale+" pause="+pause);
                        occupied.add(box); checks++;
                    }
                    System.out.println("PASS "+resolution[0]+"x"+resolution[1]+" scale="+scale+" effective="+effective+" pause="+pause);
                }
            }
        }
        if (VaultButtonLayout.place(320,240,60,List.of(new Box(0,0,320,240))) != null)
            throw new AssertionError("full modded screen must hide entry, not overlap");
        System.out.println("PASS VaultButtonLayoutTest "+(checks+1)+" checks");
    }
}
