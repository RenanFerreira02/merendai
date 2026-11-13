# Roteiros dos vídeos

## Vídeo 1 — Pitch de venda (até 3 min, com imagem e voz do aluno)

Formato: você na câmera nos blocos 1, 2 e 6; tela do app nos blocos 3 a 5. Fale devagar; 3 minutos são cerca de 400 palavras.

| Tempo | Bloco | O que mostrar | Fala (guia, não decore) |
| --- | --- | --- | --- |
| 0:00–0:25 | A história | Você na câmera | "Eu estudei em escola pública. Para muitos colegas meus, a merenda era a principal refeição do dia. A poucos quilômetros daquela escola, agricultores familiares perdiam colheita por falta de comprador. Os dois lados existem. O dinheiro existe. A lei existe. E mesmo assim a comida não chega." |
| 0:25–0:55 | O problema com número | Slide ou card com os números | "Desde 2026, pelo menos 45% do dinheiro federal da merenda tem que ser gasto comprando direto da agricultura familiar. O governo criou uma plataforma pra conectar escola e agricultor. Resultado: 1.518 agricultores cadastrados, de 3,9 milhões que poderiam estar lá. A estrada existe. Ninguém está andando nela. Porque o problema nunca foi tecnologia. Foi gente." |
| 0:55–1:20 | A solução | Diagrama das 3 camadas | "O Merendai leva o agricultor da chamada pública até o pagamento com três camadas. Um técnico de confiança cadastra no sítio. Um agente de inteligência artificial fala com o produtor por áudio, em linguagem simples. E o primeiro produtor que vende vira embaixador e traz os vizinhos." |
| 1:20–2:10 | A demo | Tela do app | Mostre: Marta ouve a chamada ("a prefeitura de Itapeva quer comprar 2.400 quilos de mandioca..."), diz "quero vender", o agente percebe que ela cobre 35% e junta Joao e Rita no mutirão, ela diz "sim", proposta enviada. Corte para o painel do técnico com a meta de 45% subindo. |
| 2:10–2:40 | Impacto e ecossistema | Card com indicadores | "Quem paga é quem economiza: o município que precisa cumprir a lei. O produtor não paga nada. Num piloto de uma região, 200 produtores ativados e R$ 1,2 milhão chegando ao campo em um ano. Isso é ODS 2, 4 e 10 no mesmo prato." |
| 2:40–3:00 | Fechamento | Você na câmera | "A gente não compete com a política pública. A gente faz ela funcionar. A tecnologia reduz o custo. Mas quem abre a porteira é uma pessoa de confiança. Esse é o Merendai. Da roça pra merenda." |

Checklist de gravação: luz na frente do rosto, microfone perto, fundo neutro, celular na horizontal, áudio do app audível (grave a tela com som do sistema ou regrave a voz do agente depois).

## Vídeo 2 — Pitch técnico (até 5 min)

Formato: gravação de tela com narração. Comece pelo diagrama de arquitetura da documentação técnica.

| Tempo | Bloco | O que mostrar | Pontos a falar |
| --- | --- | --- | --- |
| 0:00–0:30 | Arquitetura | `docs/DOCUMENTACAO_TECNICA.md` seção 1 | App Expo → API Node → Oracle. Princípio: a regra de negócio mora no banco, a API é fina, o app só conversa e mostra. |
| 0:30–1:15 | Modelo de dados | `DER.png` | 17 tabelas. Destaque PROSPECT (resultado do matching), PROPOSTA com PARTICIPANTE_MUTIRAO (o mutirão), HISTORICO_STATUS (auditoria append-only por trigger com transação autônoma). Máquinas de estado protegidas por trigger. |
| 1:15–2:15 | PL/SQL | `02_pkg_merendai.sql` | Abra `sp_gerar_prospects` (MERGE idempotente, Haversine, cobertura mínima de 10%), `sp_montar_mutirao` (soma vizinhos por score até fechar o volume, respeitando limite anual), `fn_resumo_chamada_audio` (texto em linguagem simples). Rode `05_teste_cenario.sql` e mostre os `[OK]`. |
| 2:15–2:45 | API e agente | `agente.js` | Dois modos: Claude com tool use, ou regras. As ferramentas chamam procedures. Mostre `npm test` passando. |
| 2:45–4:15 | App funcionando | Expo Go | F1: ouvir oportunidade. F2: conversa por voz, mutirão montado, proposta enviada. Troca para o técnico: contratar, 63 entregas agendadas. F3: entregas, ouvir resumo, confirmar entrega. F4: painel com o % da meta subindo. Mostre a faixa offline desligando o Wi-Fi. |
| 4:15–4:45 | Memória e eficiência | Seção 5.3 da documentação | FlatList virtualizada e memoização, histórico limitado a 12 balões, cleanup de áudio e microfone, cache com TTL, AbortController, pool Oracle com conexão sempre devolvida, ref cursor fechado. |
| 4:45–5:00 | Limites e roadmap | Seção 7 e 8 | Integração com o Contrata+Brasil simulada e declarada; WhatsApp, safra e CAE no roadmap. |

## Publicação

1. YouTube → Enviar vídeo → Visibilidade: **Não listado**.
2. Copiar o link em `LINK_VIDEO_PITCH.txt` e `LINK_VIDEO_TECNICO.txt`.
3. Link do GitHub em `LINK_GITHUB.txt` e compartilhar o repositório com o tutor.
