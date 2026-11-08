'use client';
import {useEffect,useRef} from 'react';
import {markup} from './page-markup';
import {initializeApp} from '../src/app.js';
export default function Preview(){
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(root.current){root.current.innerHTML=markup;initializeApp();}},[]);
 return <div ref={root}/>;
}
