import { ImageResponse } from '@vercel/og';

export default function handler(){
  return new ImageResponse(
    <div style={{width:'100%',height:'100%',display:'flex',background:'#faf9f5',color:'#282923',padding:'54px 64px',fontFamily:'Arial, sans-serif'}}>
      <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',justifyContent:'space-between',border:'3px solid #dfded6',borderRadius:'28px',padding:'54px 64px',background:'#eff2e9',boxShadow:'inset 16px 0 0 #476950'}}>
        <div style={{display:'flex',fontSize:34,fontWeight:800,color:'#476950',letterSpacing:'0.02em'}}>HARF-WAY / PLAY NOTES</div>
        <div style={{display:'flex',flexDirection:'column',gap:18}}>
          <div style={{display:'flex',fontSize:88,fontWeight:900,letterSpacing:'-0.05em'}}>PLAY NOTE</div>
          <div style={{display:'flex',fontSize:30,color:'#777a72',letterSpacing:'0.01em'}}>RECORDS FROM GAMES, DETOURS, AND IDEAS.</div>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
          <div style={{display:'flex',fontSize:42,fontWeight:800}}>A LITTLE DETOUR, KEPT AS A NOTE.</div>
          <div style={{display:'flex',fontSize:28,fontWeight:800,color:'#476950'}}>HARF-WAY</div>
        </div>
      </div>
    </div>,
    {width:1200,height:630,headers:{'Cache-Control':'public, max-age=86400, s-maxage=31536000, immutable'}}
  );
}
