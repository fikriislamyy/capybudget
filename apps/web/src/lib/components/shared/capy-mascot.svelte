<script lang="ts">
  let { size = 64, steam = false, state = 'relaxed' }: {
    size?: number; steam?: boolean;
    state?: 'relaxed' | 'alert' | 'worried' | 'celebrating' | 'sleeping' | 'thinking' | 'business';
  } = $props();
</script>

<svg viewBox="0 0 220 170" fill="none" width={size} height={size * 170 / 220} class="capy-art" data-state={state} focusable="false" aria-hidden="true">
    <ellipse cx="110" cy="143" rx="103" ry="22" fill="#5BB8D4" opacity=".25" />
    <path d="M55 137C43 113 49 71 75 59C94 42 150 45 172 73C187 95 180 126 168 141Z" fill="#B98B5E" stroke="#8A5F3A" stroke-width="4" />
    <ellipse cx="73" cy="56" rx="13" ry="17" transform="rotate(-22 73 56)" fill="#B98B5E" stroke="#8A5F3A" stroke-width="4" />
    <ellipse cx="160" cy="57" rx="12" ry="16" transform="rotate(25 160 57)" fill="#B98B5E" stroke="#8A5F3A" stroke-width="4" />
    <ellipse cx="144" cy="105" rx="35" ry="25" fill="#D7AD80" />
    <path d="M158 105L163 106M134 119Q143 123 150 118" stroke="#3B2A1E" stroke-width="4" stroke-linecap="round" />
    {#if state === 'alert' || state === 'worried'}
      <circle cx="94" cy="91" r="3" fill="var(--capy-bark)" />
      <path d="M142 86Q149 92 156 86" stroke="var(--capy-bark)" stroke-width="4" stroke-linecap="round" />
    {:else}
      <path d="M86 89Q93 95 100 89M142 86Q149 92 156 86" stroke="var(--capy-bark)" stroke-width="4" stroke-linecap="round" />
    {/if}
    {#if state === 'worried'}<path d="M177 71Q191 93 178 94Q164 93 177 71Z" fill="var(--pond-blue)" />{/if}
    {#if state === 'sleeping'}<text x="177" y="45" fill="var(--capy-fur-deep)" font-size="18" font-family="var(--font-heading)">zzz</text>{/if}
    {#if state === 'thinking'}<path d="M149 124Q177 101 184 115Q173 139 149 124Z" fill="var(--leaf-green)" />{/if}
    {#if state === 'celebrating'}<path d="M23 47L30 39M197 26L205 33M20 100L27 103" stroke="var(--yuzu-yellow)" stroke-width="5" stroke-linecap="round" />{/if}
    <g class="business-details" class:visible={state === 'business'}>
      <circle cx="93" cy="88" r="13" stroke="var(--capy-bark)" stroke-width="3" /><circle cx="150" cy="85" r="13" stroke="var(--capy-bark)" stroke-width="3" /><path d="M106 87L137 86" stroke="var(--capy-bark)" stroke-width="3" />
      <rect x="65" y="118" width="28" height="25" rx="3" fill="var(--onsen-cream)" stroke="var(--capy-fur-deep)" stroke-width="2" /><path d="M70 126H88M70 133H88" stroke="var(--capy-fur-deep)" stroke-width="2" />
    </g>
    <ellipse cx="78" cy="104" rx="9" ry="5" fill="#FF7A6B" opacity=".5" />
    <path d="M20 145Q65 159 109 146Q157 135 201 146" stroke="#5BB8D4" stroke-width="5" stroke-linecap="round" />
    <ellipse cx="119" cy="43" rx="13" ry="11" fill="#FFC53D" stroke="#8A5F3A" stroke-width="2" />
    <path d="M117 32Q120 24 131 27" stroke="#2F7A2A" stroke-width="3" stroke-linecap="round" />
    {#if steam}<path class="steam" d="M32 86Q23 73 33 58M197 68Q187 55 197 40M102 24Q94 13 103 4" stroke="#B98B5E" stroke-width="3" stroke-linecap="round" opacity=".5" />{/if}
  </svg>

<style>
  .capy-art { display:block; flex-shrink:0; overflow:visible; width:var(--capy-context-size,revert-layer); height:auto; }
  .business-details { display:none; }
  .business-details.visible, :global([data-mode="business"]) .business-details { display:block; }
  .steam { animation:steam-drift 5s ease-in-out infinite alternate; }
  @keyframes steam-drift { to { transform:translateY(-4px); opacity:.25; } }
  @media(prefers-reduced-motion:reduce) { .steam { animation:none; } }
</style>
