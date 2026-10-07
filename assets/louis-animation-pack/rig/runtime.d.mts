export const clips: {id:string;label:string;duration:number;loop:boolean;group:string;speed?:number}[];
export const expressions: Record<string,(number|string)[]>;
export type RigPart = {asset:string;name:string;x:number;y:number;width:number;height:number;rotation:number;anchor:{x:number;y:number}};
export type Pose = {parts:RigPart[]; attachments:Record<string,{x:number;y:number}|null>; ikError:Record<string,number>};
export function sample(clip:string,time:number,controls?:Record<string,unknown>):Pose;

export function ik(a:{x:number;y:number},target:{x:number;y:number},l1:number,l2:number,bend?:number):{elbow:{x:number;y:number};end:{x:number;y:number};a1:number;a2:number;error:number};
