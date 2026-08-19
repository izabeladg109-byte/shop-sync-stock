# Stock Smart v6

PROMPT MESTRE DEFINITIVO — ERP PROFISSIONAL DE CONTROLE DE ESTOQUE PARA TIKTOK SHOP



OBJETIVO GERAL



Desenvolva um sistema web profissional de controle de estoque online voltado especificamente para vendedores da TikTok Shop, funcionando como um ERP completo semelhante ao Tiny ERP, Omie e Bling, porém adaptado ao fluxo operacional de quem vende roupas através da TikTok Shop.



O sistema não pode ser um protótipo nem possuir funcionalidades simuladas. Todas as telas, botões, formulários, filtros, pesquisas, importações, leituras, movimentações e relatórios devem estar totalmente implementados, conectados ao Supabase/PostgreSQL e funcionando corretamente.



O foco principal do projeto é velocidade operacional, estabilidade, facilidade de uso, sincronização em tempo real e redução máxima do número de cliques durante o trabalho diário.



O sistema será utilizado em computador e celular durante separação de pedidos, reposição de estoque, conferência, embalagem e administração do estoque.







───







TECNOLOGIAS OBRIGATÓRIAS



Utilizar obrigatoriamente:



• React



• TypeScript



• Tailwind CSS



• React Query



• Supabase Auth



• Supabase Database



• Supabase Storage



• Supabase Realtime



• Supabase Edge Functions



• PostgreSQL



Arquitetura modular.



Código limpo.



Componentes reutilizáveis.



Banco totalmente normalizado.



Separação correta entre Frontend e Backend.



Toda regra de negócio obrigatoriamente executada nas Edge Functions.



Jamais deixar regras críticas somente no Frontend.







───







PROIBIÇÕES



É proibido:



• criar telas falsas;



• criar botões decorativos;



• criar funções simuladas;



• utilizar dados fixos;



• utilizar hardcoded;



• mostrar sucesso sem gravar no banco;



• criar páginas incompletas;



• criar CRUD apenas de criação sem edição;



• utilizar lógica apenas visual.



Todo botão obrigatoriamente deve executar alguma ação real.



Toda ação deve alterar o banco.



Toda alteração deve atualizar imediatamente toda interface.







───







FUNCIONAMENTO GERAL



O sistema deve funcionar exatamente como um controle de estoque manual, porém automatizado.



O usuário nunca irá editar estoque digitando números constantemente.



Toda movimentação deve acontecer através de botões rápidos.



Grandes.



Fáceis de apertar.



Pensados para operação contínua.







───







AUTENTICAÇÃO



Cadastro



Login



Recuperação de senha



Confirmação por e-mail



Sessão persistente



Sincronização em tempo real



Todos os dados ficam armazenados na nuvem.



Ao abrir a conta em qualquer computador ou celular todos os dados aparecem imediatamente.



Nunca perder informações.







───







USUÁRIOS



Administrador



Gerente



Operador



Leitor



Além disso, criar permissões individuais.



Exemplos:



Editar SKU



Excluir



Cadastrar Kits



Importar



Exportar



Backup



Auditoria



Dashboard







───







ESTRUTURA DOS PRODUTOS



Toda estrutura pertence exclusivamente ao SKU.



Nada pode ser compartilhado entre SKUs.



Fluxo obrigatório:



Categoria



↓



SKU



↓



Editar SKU



↓



Cores



↓



Tamanhos



↓



Kits



↓



Código de Barras



↓



Estoque Mínimo



↓



Configurações



Ao trocar de SKU toda interface deve carregar apenas seus próprios dados.



Nunca compartilhar:



cores



kits



tamanhos



códigos



entre SKUs diferentes.







───







CRUD COMPLETO



Tudo deve permitir:



Criar



Editar



Renomear



Duplicar



Mover



Excluir



Mover para lixeira



Restaurar



Excluir definitivamente



Isso vale para:



Categorias



SKUs



Cores



Tamanhos



Kits



Códigos de Barras



Nenhum cadastro pode ser permanente.



Se o usuário errar qualquer informação deve conseguir editar posteriormente.







───







CADASTRO DAS CORES



Ao digitar apenas o nome da cor o sistema identifica automaticamente sua representação visual.



Exemplos:



Preto



Cinza



Azul



Marrom



Caqui



Militar



Off White



Areia



Verde Água



Oliva



Bege



Branco



O sistema deve pesquisar internamente uma tabela padrão de cores.



Preencher automaticamente:



HEX



RGB



Cor visual



Sempre permitir alterar manualmente.



Mostrar:



círculo colorido



nome



HEX



Color Picker







───







ORGANIZAÇÃO



Jamais reorganizar automaticamente.



As cores aparecem exatamente na ordem cadastrada.



Os tamanhos aparecem exatamente na ordem cadastrada.



Os kits aparecem exatamente na ordem cadastrada.



Toda movimentação respeita essa ordem.







───







NOMES DOS KITS



O nome deve ser criado automaticamente conforme a ordem da seleção.



Exemplo:



Selecionou



Azul



Marrom



Resultado:



AZUL + MARROM



Selecionou



Off White



Militar



Areia



Resultado



OFF-WHITE + MILITAR + AREIA



Sempre:



Maiúsculo



Separado por +



Sem reorganizar



Sem repetir cores



Permitir edição manual.







───







ESTOQUE



Existem três controles.



Estoque Unitário



Representa as peças físicas.



Cada combinação



Cor



Tamanho



possui quantidade própria.







───







Kits Formados



Representa kits físicos já montados.



É apenas operacional.



Pode ficar negativo.



Adicionar Kits Formados não altera o estoque unitário.



Remover Kits Formados não altera sozinho o estoque unitário, apenas se o usuário colocar para alterar.







───







Kits Disponíveis



Nunca pode ser editado.



É calculado automaticamente.



Sempre utiliza a menor quantidade entre todas as cores do kit.



Exemplo



Preto P = 8



Azul P = 15



Resultado



8 Kits Disponíveis.







───







MOVIMENTAÇÃO



Refazer completamente esta tela.



Ela deve ser a mais rápida do sistema.



Fluxo:



Categoria



↓



SKU



↓



Unitário ou Kit



↓



Cor ou Kit



↓



Tamanho



↓



Quantidade



↓



Resumo



↓



Confirmar



Antes da confirmação explicar exatamente o que será alterado.



Exemplo:



Será removido:



2 Preto P



2 Marrom P



Kits Formados:



-2



Estoque Unitário:



-2 Preto



-2 Marrom



Resumo em linguagem simples.







───







CHECKBOXES



Toda movimentação possui:



☑ Alterar Estoque Unitário



☑ Alterar Kits Formados



Assim posso:



Alterar apenas estoque.



Alterar apenas Kits Formados.



Alterar ambos.



O resumo muda em tempo real.







───







LÓGICA DOS KITS



Jamais bloquear vendas porque Kits Formados chegaram em zero.



É permitido vender utilizando apenas unidades.



Também é permitido vender Kits Formados negativos.



Exemplo



Tenho



Preto P



10



Marrom P



15



Configurei



5 Kits Formados



Vendi 6.



Resultado



Kits Formados



-1



Estoque Unitário



Preto



4



Marrom



9



Kits Disponíveis



4







───







LEITURA DO PACKING LIST DA TIKTOK SHOP



Criar um módulo exclusivo chamado Leitura TikTok Shop.



Este módulo deve ser desenvolvido especificamente para reconhecer o padrão utilizado nas etiquetas (Packing List) da TikTok Shop.



O objetivo é que o operador apenas aproxime a câmera da etiqueta impressa e o sistema reconheça automaticamente o pedido.



O sistema deve utilizar a câmera do dispositivo para ler o código de barras presente na etiqueta.



Após ler o código de barras, o sistema deve interpretar automaticamente todas as informações operacionais presentes no Packing List, utilizando OCR e análise da estrutura da etiqueta.



A leitura deve funcionar mesmo que o usuário não envie arquivos digitais, utilizando apenas a etiqueta física mostrada pela câmera.



O sistema deve ser otimizado para reconhecer o layout padrão utilizado pela TikTok Shop, semelhante ao das etiquetas apresentadas nos exemplos.



A leitura deve extrair exclusivamente:



• SKU do vendedor (Seller SKU)



• Nome do SKU cadastrado



• Tipo (Unitário ou Kit)



• Nome do Kit (quando existir)



• Cores do Kit



• Cor Unitária (quando existir)



• Tamanho



• Quantidade



• Data



• Hora



• ID do Pedido (apenas para histórico)



O sistema deve ignorar completamente:



• Nome do comprador



• CPF



• Telefone



• Endereço



• Cidade



• Estado



• CEP



• Valor



• Frete



• Forma de pagamento



• Transportadora



• Código de rastreio



• Número da NF



• Nickname



• Qualquer outro dado que não seja necessário para movimentar estoque.







───







RECONHECIMENTO INTELIGENTE



Após extrair os dados, o sistema deve procurar exclusivamente dentro do banco de dados.



Nunca criar automaticamente:



novas categorias



novos SKUs



novas cores



novos kits



novos tamanhos



Caso exista alguma dúvida:



mostrar sugestões utilizando apenas os cadastros existentes.



Exemplo:



OCR reconheceu:



MILTAR



Banco possui



MILITAR



Perguntar:



Deseja utilizar MILITAR?



O mesmo vale para:



OFFWHITE



OFF WHITE



OFF-WHITE



PRET0



PRETO



AZUL MARON



AZUL + MARROM



Utilizar comparação aproximada apenas para sugerir.



Nunca alterar automaticamente.







───







FILA DE LEITURA



Após reconhecer um pedido.



Mostrar um cartão contendo:



Imagem da leitura.



SKU.



Kit.



Cor.



Tamanho.



Quantidade.



Resumo do estoque que será alterado.



Botões:



Confirmar



Editar



Cancelar



Ao confirmar:



O pedido entra em uma fila.



A câmera abre novamente automaticamente.



Sem trocar de tela.



No final existe uma tela:



Revisar Todos.



Confirmar Todas as Movimentações.







───







CÓDIGOS DE BARRAS



Cada SKU pode possuir vários códigos.



Cada Kit pode possuir vários códigos.



Permitir:



Leitor USB



Bluetooth



Câmera



Digitação



Gerar código interno.







───







IMPORTAÇÃO



Excel



CSV



ODS



Validação completa.



Resumo antes da importação.







───







EXPORTAÇÃO



Excel



CSV



PDF







───







DASHBOARD



Mostrar:



Mais vendidos



Menos vendidos



Maior estoque



Menor estoque



Produtos zerados



Categorias



Movimentações



Gráficos



Comparativos



Histórico



Filtros:



Dia



Semana



Mês



Ano



Personalizado







───







ALERTAS



Unidades



Menor que 3



Laranja



Zero



Vermelho



Kits Disponíveis



Utilizar sempre a menor quantidade entre as cores.



Aplicar os mesmos alertas.







───







LIXEIRA



Tudo excluído vai para lixeira.



Permitir:



Restaurar



Excluir definitivamente



Selecionar tudo



Excluir selecionados



Excluir toda a lixeira



Programar exclusão automática após determinado período.







───







DESFAZER



Após qualquer ação.



Mostrar notificação:



Operação realizada.



Botão



Desfazer.



Desfazer deve reverter completamente a operação.







───







AUDITORIA



Registrar:



Login



Logout



Criações



Edições



Exclusões



Restaurações



Movimentações



Leituras da câmera



Leituras do Packing List



Importações



Exportações



Backups



Registrar:



Usuário



Data



Hora



IP



Dispositivo



Navegador



Valores antigos



Valores novos



Jamais permitir apagar logs.







───







PERFORMANCE



Corrigir definitivamente:



Tela preta.



Tela branca.



CSS desaparecendo.



Renderização dupla.



Layout piscando.



Botões sem ação.



Falha na movimentação.



Lentidão.



Toda ação deve ocorrer em poucos milissegundos.



Utilizar:



React Query



Cache



Paginação



Lazy Loading



Virtualização



Realtime



Edge Functions



Índices otimizados no PostgreSQL.







───







CORREÇÃO FINAL OBRIGATÓRIA



O sistema deve ser entregue completamente funcional.



Todos os CRUDs devem permitir criar, editar, excluir, restaurar e renomear.



Toda movimentação deve gravar corretamente no banco.



Todos os dashboards devem atualizar automaticamente.



Todos os botões devem executar funções reais.



Toda leitura da câmera deve reconhecer corretamente o padrão de Packing List da TikTok Shop.



Toda lógica de estoque unitário, kits formados e kits disponíveis deve permanecer consistente mesmo com múltiplos usuários acessando simultaneamente.



O sistema deve ter aparência e comportamento de um ERP comercial pronto para uso em produção, sem telas incompletas, sem funcionalidades decorativas, sem erros de movimentação e totalmente integrado ao banco de dados.















───







MÓDULO EXCLUSIVO — LEITOR INTELIGENTE DE PACKING LIST DA TIKTOK SHOP



Este módulo deve ser desenvolvido exclusivamente para o padrão oficial de Packing List utilizado pela TikTok Shop.



O objetivo é permitir que o operador simplesmente aponte a câmera do computador ou do celular para a etiqueta impressa do pedido e o sistema reconheça automaticamente todas as informações necessárias para realizar a movimentação do estoque, sem que o operador precise tocar na tela, digitar qualquer informação ou selecionar manualmente o produto.



O sistema deve ser otimizado especificamente para etiquetas como as utilizadas pela TikTok Shop, contendo o grande código de barras horizontal, Product Name, SKU, Seller SKU e Qty.



O código de barras é a fonte principal



O código de barras da etiqueta deve ser tratado como a principal fonte de identificação do pedido.



Sempre que possível, o sistema deve:



• localizar automaticamente o código de barras na imagem;



• detectar sua posição independentemente da orientação da câmera;



• corrigir automaticamente inclinação, perspectiva e rotação;



• aumentar contraste e nitidez antes da leitura;



• decodificar o código em tempo real;



• utilizar o valor decodificado para localizar ou validar o pedido.



O sistema nunca deve depender exclusivamente de OCR quando o código de barras puder ser lido.



Leitura contínua



Ao abrir a câmera, o sistema permanece continuamente procurando novas etiquetas.



Fluxo:



Abrir câmera



↓



Encontrar código de barras



↓



Ler automaticamente



↓



Interpretar o Packing List



↓



Mostrar confirmação



↓



Adicionar à fila



↓



Abrir imediatamente a câmera novamente



Tudo deve ocorrer sem trocar de página.



Sem fechar a câmera.



Sem reiniciar a captura.



Sem exigir novos cliques.



Reconhecimento automático da etiqueta



O sistema deve reconhecer automaticamente o layout da TikTok Shop.



Não exigir enquadramento perfeito.



Deve funcionar com:



• etiqueta inclinada;



• etiqueta parcialmente torta;



• impressão térmica fraca;



• papel amassado;



• iluminação ruim;



• sombras;



• brilho excessivo;



• câmera tremendo;



• câmera de celular;



• webcam;



• diferentes resoluções.



Antes da leitura o sistema deve automaticamente:



• detectar a etiqueta;



• recortar apenas a etiqueta;



• remover fundo;



• corrigir perspectiva;



• corrigir rotação;



• ajustar brilho;



• ajustar contraste;



• aumentar nitidez;



• somente então iniciar a leitura.



Informações obrigatórias que devem ser obtidas



Após a leitura do código de barras e da estrutura da etiqueta, o sistema deve identificar automaticamente:



• Seller SKU



• SKU



• Product Name



• Qty



• Tipo (Kit ou Unitário)



• Cor



• Cores do Kit



• Tamanho



• Código interno cadastrado



• Categoria correspondente



• Produto correspondente no banco



Caso o banco possua mais informações do que a etiqueta, utilizar sempre as informações cadastradas no banco como referência principal.



Interpretação do campo SKU



O sistema deve interpretar automaticamente diferentes formatos utilizados pela TikTok Shop.



Exemplos:



KIT 2 - AZUL + MARROM, M/42



↓



Tipo



Kit



↓



Cores



AZUL



MARROM



↓



Tamanho



M/42



Outro exemplo:



1 PÇ - MARROM, M/42



↓



Tipo



Unitário



↓



Cor



MARROM



↓



Tamanho



M/42



O sistema deve reconhecer automaticamente dezenas de formatos diferentes utilizados na descrição do SKU.



Reconhecimento do Seller SKU



O campo Seller SKU deve ser utilizado como o identificador principal para localizar o produto dentro do banco.



Exemplo:



130



↓



buscar Seller SKU = 130



↓



abrir automaticamente o cadastro correspondente.



Caso exista apenas um produto com aquele Seller SKU, nenhuma confirmação adicional deve ser necessária.



Correspondência com o banco



Após localizar o produto:



identificar categoria;



identificar SKU;



identificar kit;



identificar cores;



identificar tamanho;



identificar estoque;



identificar kits formados;



identificar kits disponíveis.



Tudo automaticamente.



Sem intervenção do usuário.



Validação Inteligente



Caso alguma informação da etiqueta esteja incompleta ou divergente:



não criar automaticamente novos registros;



não criar novos SKUs;



não criar novas cores;



não criar novos kits;



não criar novos tamanhos.



Mostrar sugestões utilizando apenas os dados existentes no banco.



Exemplo:



Etiqueta:



MARON



Banco:



MARROM



Perguntar:



Deseja utilizar MARROM?



Campos que devem ser completamente ignorados



O sistema nunca deve utilizar para movimentação de estoque:



Order ID (exceto histórico)



Package ID



Tracking Number



Created Time



In Transit By



Nome do comprador



Nickname



CPF



Telefone



Endereço



Cidade



Estado



CEP



Frete



Transportadora



Valor



Forma de pagamento



Nota Fiscal



Código de rastreamento



Esses dados devem ser armazenados apenas para consulta, quando desejado, mas jamais utilizados na lógica do estoque.



Confirmação automática



Após identificar o produto, mostrar um cartão contendo:



Categoria



SKU



Tipo



Cor



Kit



Tamanho



Quantidade



Saldo Atual



Saldo Após Movimentação



Resumo da alteração



Botões:



✔ Confirmar



✏ Editar



❌ Cancelar



Ao confirmar:



registrar movimentação;



gravar auditoria;



atualizar estoque;



atualizar dashboard;



atualizar histórico;



atualizar demais dispositivos em tempo real;



reabrir imediatamente a câmera para o próximo Packing List.



Desempenho



A leitura deve ocorrer praticamente em tempo real.



Meta:



• detectar a etiqueta em menos de 200 ms;



• localizar o código de barras em menos de 300 ms;



• decodificar o código em menos de 500 ms;



• localizar o produto no banco em menos de 300 ms;



• apresentar a tela de confirmação em menos de 1 segundo após enquadrar a etiqueta.



Nenhuma tela de carregamento deve interromper o fluxo do operador.







───







Corrija o problema em que o e-mail de verificação da conta está sendo marcado como inseguro pelo navegador/provedor de e-mail, exibindo um aviso de que o site pode roubar dados e impedindo a confirmação da conta.



Verifique e corrija toda a configuração de autenticação do Supabase, incluindo:



URL do projeto (Site URL) e Redirect URLs;



domínio utilizado nos links de autenticação;



configuração do domínio personalizado (caso necessário);



templates dos e-mails de autenticação;



certificados SSL/TLS válidos;



cabeçalhos de segurança;



políticas de redirecionamento;



SPF, DKIM e DMARC (caso esteja utilizando domínio próprio para envio de e-mails).



O objetivo é que o e-mail de confirmação seja reconhecido como seguro, sem avisos de phishing ou site perigoso, permitindo que o usuário clique no link e confirme a conta normalmente. Não utilize soluções temporárias; identifique e corrija a causa raiz do problema.



Correções e melhorias do sistema



Corrija os seguintes problemas sem alterar funcionalidades que já estejam funcionando corretamente.



1. Formação de Kits



- Corrigir o problema que impede informar a quantidade de kits formados sem alterar o estoque de forma incorreta.

- A formação do kit deve descontar apenas os produtos utilizados na composição do kit, mantendo a lógica correta de movimentação.

- Revisar toda a lógica de atualização do estoque relacionada à formação de kits.



2. Movimentação



- Restaurar a opção "Alternativa" na tela de Movimentação. Ela não está aparecendo no sistema e deve voltar a funcionar normalmente.

- Garantir que todas as funcionalidades de movimentação continuem funcionando após a correção.



3. Estoque



- Reorganizar completamente a tela de estoque.

- Os produtos estão misturados e dificultam a visualização.

- Separar corretamente os produtos por categoria, tipo ou outra organização lógica.

- Melhorar a disposição visual da lista para facilitar a localização dos itens.

- Garantir que pesquisas e filtros continuem funcionando.



4. Kits



- Na tela de movimentação dos kits, exibir corretamente as bolinhas com as cores dos kits.

- Cada kit deve mostrar sua cor correspondente exatamente como cadastrada.



5. Tema



Adicionar suporte completo para:



- Modo Claro.

- Modo Escuro.

- Botão para alternar entre os dois modos.

- Salvar automaticamente a preferência do usuário.



6. Interface



Corrigir elementos da interface que estão ficando invisíveis devido às cores.



Exemplos:



- O botão do menu (ícone dos três traços no canto superior) está com a mesma cor do fundo e praticamente invisível.

- Revisar todos os botões, ícones, textos e elementos de navegação para garantir contraste adequado tanto no modo claro quanto no modo escuro.

- Nenhum botão ou ícone deve ficar invisível ou difícil de identificar.



7. Revisão Geral



Após concluir todas as correções:



- Verificar se nenhuma funcionalidade existente foi quebrada.

- Corrigir possíveis erros visuais.

- Corrigir problemas de responsividade.

- Garantir uma interface organizada, intuitiva e consistente em todas as telas.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://shop-sync-stock.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e1d5dd3a-12df-4dfd-9266-f28f16d97194).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
