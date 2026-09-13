# DuoLiga v2.4

Aplicativo web do desafio de idiomas, pronto para Netlify.

## Novidade desta versão
- Cada participante cria uma senha/PIN individual de 4 dígitos no cadastro.
- Ao entrar em um perfil existente em outro aparelho ou após trocar de usuário, o PIN é solicitado.
- Perfis criados em versões anteriores, sem PIN, recebem uma tela para cadastrar os 4 dígitos na próxima entrada.
- O PIN não é salvo em texto puro: o servidor guarda somente uma versão hash com salt e não a envia ao navegador.
- Mantidos: perfil com foto, check-in, ranking, metas, conversação de 5 minutos, missões, prendas, cofrinho, histórico e exclusão de perfil.

## Publicação
Envie todo o conteúdo desta pasta ao mesmo repositório GitHub do DuoLiga. O Netlify fará um novo deploy automaticamente. Se não fizer, use Deploys > Trigger deploy > Deploy site.

## Estrutura
- `public/` interface do app
- `netlify/functions/` API e armazenamento Netlify Blobs
- `netlify.toml` configuração do deploy
