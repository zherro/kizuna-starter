/**
 * Urna eletrônica ilustrada (SVG) com movimento: a urna flutua, o cursor da tela pisca, as teclas
 * acendem em sequência e a tecla CONFIRMA pulsa. Sem número de candidato — neutro de propósito.
 * Animações em globals.css (prefixo `hs-`); desligam com prefers-reduced-motion.
 */
export function UrnaArt() {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  return (
    <svg viewBox="0 0 220 250" className="hs-urna h-auto w-full" role="presentation">
      <defs>
        <linearGradient id="hs-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3efe6" />
          <stop offset="1" stopColor="#cfc8b8" />
        </linearGradient>
        <linearGradient id="hs-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dfeedd" />
          <stop offset="1" stopColor="#b9d6b6" />
        </linearGradient>
      </defs>

      {/* sombra no chão */}
      <ellipse className="hs-shadow" cx="110" cy="238" rx="78" ry="7" fill="#000" opacity="0.28" />

      <g className="hs-float">
        {/* corpo */}
        <rect x="14" y="8" width="192" height="220" rx="18" fill="url(#hs-body)" />
        <rect x="14" y="8" width="192" height="220" rx="18" fill="none" stroke="#fff" strokeOpacity="0.5" />

        {/* tela */}
        <rect x="30" y="24" width="160" height="82" rx="8" fill="#2a2f2a" />
        <rect x="35" y="29" width="150" height="72" rx="5" fill="url(#hs-screen)" />
        <text x="45" y="46" fontSize="8" fontWeight="700" fill="#2f4a2f" fontFamily="system-ui, sans-serif">
          SEU VOTO PARA
        </text>
        <text x="45" y="59" fontSize="7" fill="#2f4a2f" fontFamily="system-ui, sans-serif">
          Presidente
        </text>
        {/* campos do número */}
        <rect x="45" y="68" width="22" height="26" rx="3" fill="#fff" stroke="#2f4a2f" />
        <rect x="72" y="68" width="22" height="26" rx="3" fill="#fff" stroke="#2f4a2f" />
        <rect className="hs-cursor" x="52" y="86" width="8" height="2.5" rx="1" fill="#2f4a2f" />
        <rect className="hs-cursor hs-cursor-2" x="79" y="86" width="8" height="2.5" rx="1" fill="#2f4a2f" />
        {/* foto fantasma */}
        <rect x="140" y="44" width="34" height="46" rx="3" fill="#2f4a2f" opacity="0.14" />
        <circle cx="157" cy="60" r="7" fill="#2f4a2f" opacity="0.2" />
        <path d="M144 88c2-12 8-16 13-16s11 4 13 16z" fill="#2f4a2f" opacity="0.2" />

        {/* teclado */}
        {keys.map((k, i) => {
          const row = Math.floor(i / 3);
          const col = i % 3;
          const x = i === 9 ? 79 : 36 + col * 28;
          const y = 120 + row * 22;
          return (
            <g key={k} className="hs-key" style={{ animationDelay: `${i * 0.28}s` }}>
              <rect x={x} y={y} width="24" height="17" rx="4" fill="#2b2b2b" />
              <text
                x={x + 12}
                y={y + 12}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill="#fff"
                fontFamily="system-ui, sans-serif"
              >
                {k}
              </text>
            </g>
          );
        })}

        {/* BRANCO / CORRIGE / CONFIRMA */}
        <rect x="122" y="120" width="68" height="17" rx="4" fill="#f4f4f4" stroke="#bbb" />
        <text x="156" y="132" textAnchor="middle" fontSize="8" fontWeight="700" fill="#333" fontFamily="system-ui, sans-serif">
          BRANCO
        </text>
        <rect x="122" y="142" width="68" height="17" rx="4" fill="#ee7d3b" />
        <text x="156" y="154" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">
          CORRIGE
        </text>
        <g className="hs-confirm">
          <rect x="122" y="164" width="68" height="40" rx="6" fill="#2fa84f" />
          <text x="156" y="188" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">
            CONFIRMA
          </text>
        </g>

        {/* fenda do comprovante */}
        <rect x="36" y="212" width="148" height="5" rx="2.5" fill="#8b8574" />
      </g>
    </svg>
  );
}
