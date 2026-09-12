# DuoLiga

Aplicativo web responsivo para um desafio familiar de idiomas: check-in do Duolingo, ranking, conversa presencial de 5 minutos, missões semanais, prendas/cofrinho, histórico, conquistas e foto de perfil.

## Deploy no Netlify

1. Envie esta pasta para um repositório Git (GitHub/GitLab/Bitbucket) ou use o Netlify CLI.
2. No Netlify, crie um projeto a partir do repositório.
3. Não é necessário comando de build. O `netlify.toml` já define a publicação e as Functions.
4. Recomendado: em **Project configuration → Environment variables**, crie:
   - `APP_ACCESS_CODE` = um código que só vocês saibam, por exemplo `familia2026`.
5. Faça o deploy. Todos usam o mesmo endereço e o mesmo código.

O app usa **Netlify Blobs** para sincronizar os dados entre aparelhos e armazenar imagens comprimidas.

## Rodar localmente

Com Node.js instalado:

```bash
npm install
npx netlify dev
```

Abra o endereço mostrado no terminal.

## Regras implementadas

- +1 por check-in diário.
- +2 ao bater a meta semanal (padrão 5/7).
- +3 por 7/7.
- +2 por missão semanal.
- +3 por participar de uma conversa oficial de 5 minutos.
- +2 para o vencedor da conversa.
- +1 para quem tiver o maior XP na semana (empates recebem o bônus).
- -3 por semana encerrada com menos de 4 dias de estudo.
- Prenda automática em dinheiro para semana encerrada abaixo da meta configurada.

## Observações

- O cronômetro precisa chegar a 00:00 para liberar o registro da conversação.
- Fotos de perfil e prints são comprimidos no navegador antes do upload.
- O botão “Cutucar” registra a provocação no feed do app; esta versão não envia push notification.
