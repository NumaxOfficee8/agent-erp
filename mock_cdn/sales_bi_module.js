// Finance BI Dashboard Dynamic ES Module Component
// Implements the Svelte 5 component mounting interface contract (mounting elements to anchor, returning destroy callback)

export default function SalesBI(anchor, props) {
  const container = document.createElement('div');
  container.className = 'sales-bi-wrapper';
  container.style.animation = 'fadeIn 0.4s ease-out';
  
  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2 style="color: #A855F7; font-size: 1.3rem; font-weight: 600; margin: 0;">Finance BI 數據大看板 (Hot-Reloaded JS Module)</h2>
      <span style="background: rgba(168, 85, 247, 0.15); color: #A855F7; padding: 4px 12px; border-radius: 9999px; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.5px;">LIVE COMPONENT</span>
    </div>
    
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 20px;">
      <div style="background: #1D1D24; padding: 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05)">
        <div style="color: #9CA3AF; font-size: 0.85rem;">本月總營收 (Mirrored Revenue)</div>
        <div style="font-size: 1.8rem; font-weight: bold; margin-top: 4px; color: #fff;">$1,245,000</div>
        <div style="color: #10B981; font-size: 0.8rem; font-weight: 600; margin-top: 4px; display: flex; align-items: center; gap: 4px;">
          <span>↑ 12%</span> <span style="color: #6B7280; font-weight: normal;">較上月</span>
        </div>
      </div>
      <div style="background: #1D1D24; padding: 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05)">
        <div style="color: #9CA3AF; font-size: 0.85rem;">淨利潤率 (Net Margin)</div>
        <div style="font-size: 1.8rem; font-weight: bold; margin-top: 4px; color: #A855F7;" id="bi-profit-val">25.0%</div>
        <div style="color: #6B7280; font-size: 0.8rem; margin-top: 4px;">安全水位目標: 25.0%</div>
      </div>
      <div style="background: #1D1D24; padding: 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05)">
        <div style="color: #9CA3AF; font-size: 0.85rem;">邊緣工廠產能利用率</div>
        <div style="font-size: 1.8rem; font-weight: bold; margin-top: 4px; color: #F59E0B;" id="bi-capacity-val">85.0%</div>
        <div style="color: #9CA3AF; font-size: 0.8rem; margin-top: 4px;">剩餘可用彈性產能: 15%</div>
      </div>
    </div>
    
    <div style="background: #1E1E26; padding: 20px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); margin-bottom: 20px;">
      <h3 style="margin-bottom: 8px; font-size: 1rem; color: #FFF; font-weight: 600;">產能利潤率敏感度模擬器 (Local Simulator)</h3>
      <p style="color: #9CA3AF; font-size: 0.9rem; margin-bottom: 16px; line-height: 1.4;">
        拖拽滑桿模擬 Peter 核准外部大訂單時，邊緣端產能消耗對淨利潤率的即時變化影響：
      </p>
      
      <div style="display: flex; align-items: center; gap: 16px;">
        <input 
          type="range" 
          id="bi-slider" 
          min="20" 
          max="40" 
          value="25" 
          style="flex-grow: 1; accent-color: #A855F7; cursor: pointer; height: 6px; background: #2D2D37; border-radius: 3px; outline: none;" 
        />
        <span style="font-size: 1.2rem; font-weight: 700; color: #A855F7; width: 60px; text-align: right;" id="bi-slider-val">25%</span>
      </div>
    </div>

    <div style="background: #1D1D24; padding: 18px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05)">
      <h4 style="margin-bottom: 8px; font-size: 0.95rem; color: #FFF;">系統安全宣告</h4>
      <p style="color: #6B7280; font-size: 0.85rem; line-height: 1.45;">
        該動態組件包含核心 BI 代碼，在未完成企業金鑰認證前，硬碟中無此二進位檔案，杜絕了離線主程式二進位反編譯漏洞。
      </p>
    </div>
  `;

  anchor.appendChild(container);
  
  // Select DOM Elements
  const slider = container.querySelector('#bi-slider');
  const sliderVal = container.querySelector('#bi-slider-val');
  const profitVal = container.querySelector('#bi-profit-val');
  const capacityVal = container.querySelector('#bi-capacity-val');
  
  // Dynamic slide event listener
  slider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    sliderVal.textContent = `${val}%`;
    profitVal.textContent = `${val}.0%`;
    
    // Simulate capacity usage: capacity increases as profit target is set higher
    const cap = 60 + (val - 20) * 2.5;
    capacityVal.textContent = `${cap.toFixed(1)}%`;
  });

  // Return destructor
  return {
    destroy() {
      container.remove();
      console.log('Finance BI dynamic component destroyed.');
    }
  };
}
