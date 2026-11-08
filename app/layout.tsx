import type {Metadata} from 'next';
export const metadata:Metadata={title:'RetainerLens — See what the work is worth.',description:'Monthly retainer profitability reviews for small agencies.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><head><link rel="stylesheet" href="/style.css"/></head><body>{children}</body></html>;}
