import { Composition } from "remotion";
import { EscapeRoomThumbnail } from "./EscapeRoomThumbnail";

export const RemotionRoot = () => {
    return (
        <Composition
            id="EscapeRoomThumbnail"
            component={EscapeRoomThumbnail}
            durationInFrames={150}
            fps={30}
            width={1280}
            height={720}
        />
    );
};
