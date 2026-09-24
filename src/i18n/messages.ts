export const languages = ['pt-BR', 'en-US', 'es-ES'] as const;
export type AppLanguage = (typeof languages)[number];

export const languageNames: Record<AppLanguage, string> = {
  'pt-BR': 'pt-BR',
  'en-US': 'en-US',
  'es-ES': 'es-ES',
};

/**
 * Textos do wizard de anúncio (pt-BR). Genéricos de propósito — servem para evento, trilha,
 * pousada etc. Cada projeto ajusta aqui o tom/vocabulário do seu nicho. `en-US`/`es-ES` reusam
 * este objeto até serem traduzidos (fallback em português).
 */
export const WIZARD_PT_BR = {
  exitConfirm: 'Sair agora descarta esta publicação. Tem certeza?',

  // Rótulo de cada passo no stepper/trilho, por chave do passo (sobrescreve o `label` do registry).
  stepLabels: {
    start: 'Titulo',
    category: 'Tipo',
    location: 'Onde você atende',
    price: 'Quanto você cobra',
    images: 'Fotos',
    description: 'Descrição',
    'dynamic-form': 'Formulário',
    moderation: 'Status',
  } as Record<string, string>,

  common: {
    whyLabel: 'Por que pedimos isso?',
    whyShort: 'Por quê?',
    hideWhy: 'Ocultar explicação',
  },

  start: {
    title: 'Hora de criar o título da sua publicação',
    subtitle: 'O que você oferece, ou descrição curta do assunto.',
    placeholder: '... digite o titulo aqui.',
    tooShort: 'Escreva um pouco mais (mínimo 5 caracteres).',
  },

  category: {
    title: 'Qual o tipo da sua publicação?',
    subtitle: 'Escolha o tipo — a categoria vem na sequência.',
    why: 'Começamos pelo tipo porque ele é mais amplo: a mesma categoria pode aparecer em tipos diferentes, e o tipo certo põe o seu anúncio na frente de quem procura.',
    emptyGroups: 'Nenhum tipo encontrado.',
    pickCategory: 'Escolher categoria',
    changeGroupCategory: 'Mudar tipo',
    change: 'Trocar',
    open: 'Abrir',
    pickerTitle: 'Qual a sua categoria?',

    categoryTitle: 'Qual a categoria do serviço?',
    loadingCategories: 'Carregando categorias…',
    back: 'Voltar',
    noCategories: 'Nenhuma categoria ativa nesta área.',
  },

  subcategory: {
    title: 'Especialidades',
    stepTitle: 'Quais especialidades você atende?',
    changeCategory: 'Mudar categoria',

    editTags: 'Editar',
    why: 'Cada especialidade marcada é mais uma busca em que a sua publicação aparece. Marque só o que realmente se aplica.',
    empty:
      'Esta categoria não tem especialidades cadastradas. Você detalha no título e na descrição.',
  },

  location: {
    title: 'Onde acontece?',
    subtitle: 'Escolha o formato que combina com a sua publicação.',
    why: 'Isso define como o público encontra você. Publicações com endereço aparecem nas buscas da região; publicações online aparecem para todo o país.',
    noCliente: 'Você vai até o endereço do interessado.',
    noEstabelecimento: 'O interessado vem até o seu endereço.',
    remoto: 'Acontece online, sem atendimento presencial.',
    addressTitle: 'Endereço de referência',
    addressHint:
      'Usado só para posicionar você na busca por região. O endereço exato não aparece na publicação.',
    addressSearch: 'Não sei meu CEP',
    // Textos por opção de `locationOptions` (kizuna.config.json) — a chave é o `value` gravado.
    options: {
      no_estabelecimento: {
        title: 'Presencial',
        description: 'Atendimento em um endereço físico.',
      },
      remoto: {
        title: 'Online',
        description: 'Atendimento à distância, sem endereço.',
        hint: 'Publicações online aparecem para todo o país, sem filtro de região.',
      },
    } as Record<string, { title?: string; description?: string; hint?: string }>,
    remoteHint: 'Publicações online aparecem para todo o país, sem filtro de região.',
  },

  price: {
    title: 'Quanto custa?',
    subtitle:
      "Um valor de referência ajuda o público a decidir antes de entrar em contato. Não precisa ser o preço final — é o 'a partir de'.",
    why: "Publicações com um valor de referência recebem contatos mais sérios: quem chama já sabe a ordem de grandeza. Se o valor depende de cada caso, escolha 'sob orçamento' e combine o resto no chat.",
    unitLabel: 'Como é cobrado?',
    amountOptional: 'Valor a partir de (opcional)',
    amount: 'Valor a partir de (R$)',
    quoteHint:
      'Com “sob orçamento” você pode deixar em branco. Se preencher, o público vê “a partir de R$ X”.',
    agree: 'A combinar',
    // Tabela de preços (perfil `stepProfiles.price` com `priceTable: true`).
    table: {
      title: 'Tabela de preços',
      hint: 'Adicione os itens, pacotes ou formas de pagamento com o valor de cada um.',
      itemTitle: 'Título',
      description: 'Descrição',
      amount: 'Valor (R$)',
      agree: 'A combinar',
      linkLabel: 'Texto do botão',
      linkUrl: 'Link do botão (https://…)',
      add: 'Adicionar item',
      remove: 'Remover item',
      empty: 'Nenhum item ainda.',
    },
    // Textos por forma de cobrança (chave = `textKey` ou o `value` de `price_unit`):
    // `{ title, description }`. Sem entrada, valem os textos padrão do core.
    options: {
      service: {
        title: 'Por evento',
        description: 'Valor do ingresso ou voucher',
      },
      hour: { title: 'Por hora', description: 'Passe ou voucher específico.' },
      quote: {
        title: 'Sob orçamento',
        description: 'Você combina o valor no chat',
      },
    } as Record<string, { title?: string; description?: string }>,
  },

  images: {
    title: 'Adicione fotos da sua publicação',
    subtitle: 'Adicione ao menos 1 foto para continuar. A primeira vira a capa da publicação.',
    why: 'Quem procura quer ver antes de entrar em contato. Publicações com foto recebem muito mais contato — mostre o local, o ambiente e o que está incluso.',
    saveError: 'Não foi possível salvar as imagens da publicação.',
    saveFirst: 'Volte e salve a categoria antes de adicionar fotos.',
    tip: 'Fotos suas valem mais que imagens da internet. Boa luz e enquadramento reto passam confiança.',
  },

  description: {
    title: 'Conte um pouco sobre a sua publicação',
    subtitle: 'Escreva com suas palavras: o que é, o que tem de diferente e como funciona.',
    why: 'É aqui que o visitante decide entre entrar em contato ou passar para a próxima publicação. Responder as dúvidas comuns (o que está incluso, duração, regras, como chegar) evita idas e vindas no chat.',
    placeholder:
      'Ex.: Trilha de dificuldade moderada, 4 horas, com guia local e lanche incluso. Saídas aos sábados às 8h, grupos de até 10 pessoas.',
    hint: 'Dica: o que está incluso, região, duração, regras e como chegar.',
    minMet: 'Mínimo atingido',
    minCount: 'Mínimo de {min} caracteres ({length}/{min})',
    tip: 'Evite descrições vagas. Ser específico sobre o que você oferece passa mais confiança e atrai o público certo.',
  },

  moderation: {
    title: 'Revisão',
    subtitle:
      'Registre a decisão desta revisão. Ela vira um novo registro de moderação e ajusta o status da publicação automaticamente.',
    decision: 'Decisão',
    approve: 'Aprovar',
    reject: 'Rejeitar',
    escalate: 'Escalar para outro revisor',
    reasonLabel: 'Motivo da rejeição (se aplicável)',
    reasons: {
      inappropriate_content: 'Conteúdo inadequado',
      wrong_category: 'Categoria incorreta',
      duplicate: 'Duplicado',
      spam: 'Spam',
      price_invalid: 'Preço inválido',
      missing_info: 'Informações faltando',
      prohibited_item: 'Item proibido',
      fake_listing: 'Publicação falsa',
      other: 'Outro motivo',
    },
    noteLabel: 'Observação da revisão',
    notePlaceholder: 'Detalhes da decisão — visível só para a equipe (opcional)',
  },

  page: {
    loading: 'Carregando dados da publicação...',
    loadError: 'Não foi possível carregar a publicação para edição.',
  },
};

export type WizardMessages = typeof WIZARD_PT_BR;

export type AppMessages = {
  wizard: WizardMessages;
  nav: {
    signIn: string;
    signUp: string;
    login: string;
    title: string;
    home: string;
    services: string;
    plans: string;
    contact: string;
    theme: string;
    language: string;
    light: string;
    dark: string;
    system: string;
    color: string;
    blue: string;
    green: string;
    purple: string;
    teal: string;
    red: string;
    orange: string;
    coral: string;
    openMenu: string;
    closeMenu: string;
  };
  home: {
    heroLead: string;
    heroVerbs: string;
    heroReducedVerb: string;
    heroTail: string;
    heroSub: string;
    searchPlaceholder: string;
    searchButton: string;
    categoriesTitle: string;
    categoriesAll: string;
    nearbyTitle: string;
    nearbySub: string;
    howTitle: string;
    step1Title: string;
    step1Text: string;
    step2Title: string;
    step2Text: string;
    step3Title: string;
    step3Text: string;
    joinKicker: string;
    joinTitle: string;
    joinText: string;
    joinCta: string;
  };
  sejaPrestador: {
    metaTitle: string;
    headline: string;
    subhead: string;
    stepsTitle: string;
    step1Title: string;
    step1Text: string;
    step2Title: string;
    step2Text: string;
    step3Title: string;
    step3Text: string;
    formTitle: string;
    benefitsTitle: string;
    benefit1: string;
    benefit2: string;
    benefit3: string;
    benefit4: string;
    ctaCreateAccount: string;
    haveAccount: string;
  };
  footer: {
    tagline: string;
    navigation: string;
    categories: string;
    social: string;
    rights: string;
    weatherCredit: string;
    madeWith: string;
  };
  default: {
    dashboard: string;
  };
};

export const messages: Record<AppLanguage, AppMessages> = {
  'pt-BR': {
    wizard: WIZARD_PT_BR,
    nav: {
      title: 'Foco Total',
      signIn: 'Entrar',
      signUp: 'Registrar-se',
      login: 'Login',
      home: 'Inicio',
      services: 'Servicos',
      plans: 'Planos',
      contact: 'Contato',
      theme: 'Tema',
      language: 'Idioma',
      light: 'Claro',
      dark: 'Escuro',
      system: 'Sistema',
      color: 'Cor',
      blue: 'Azul',
      green: 'Verde',
      purple: 'Roxo',
      teal: 'Verde-azulado',
      red: 'Vermelho',
      orange: 'Laranja',
      coral: 'Coral',
      openMenu: 'Abrir menu',
      closeMenu: 'Fechar menu',
    },
    home: {
      heroLead: 'Precisa',
      heroVerbs: 'consertar, ensinar, reformar, cuidar, pintar, montar',
      heroReducedVerb: 'resolver',
      heroTail: 'perto de você?',
      heroSub: 'Profissionais avaliados por quem já contratou, aqui na sua região.',
      searchPlaceholder: 'buscar serviço ou profissional',
      searchButton: 'Buscar',
      categoriesTitle: 'Seu guia de entretenimento começa aqui. Descubra o que fazer!',
      categoriesAll: 'Ver todas',
      nearbyTitle: 'Quem está por perto',
      nearbySub: 'Uma amostra de quem está oferecendo serviço agora.',
      howTitle: 'Como funciona',
      step1Title: 'Busque',
      step1Text: 'Diga o que você precisa. A gente mostra quem faz isso perto de você.',
      step2Title: 'Converse',
      step2Text: 'Fale direto com o profissional, tire dúvidas e peça um orçamento.',
      step3Title: 'Combine',
      step3Text: 'Fechou? Combine data, valor e pagamento com quem você escolheu.',
      joinKicker: 'Para quem oferece serviço',
      joinTitle: 'Você também faz?',
      joinText: 'Publique seu serviço de graça e apareça para quem procura na sua região.',
      joinCta: 'Anunciar meu serviço',
    },
    sejaPrestador: {
      metaTitle: 'Seja um prestador',
      headline: 'Transforme seu serviço em mais clientes',
      subhead:
        'Entre ou crie sua conta grátis e comece a aparecer para quem procura o que você faz na sua região.',
      stepsTitle: 'Como começar',
      step1Title: 'Crie seu perfil',
      step1Text: 'Conta rápida e gratuita. Adicione sua área de atuação e onde você atende.',
      step2Title: 'Publique seus serviços',
      step2Text: 'Descreva o que você faz, adicione fotos e defina seus preços.',
      step3Title: 'Receba contatos',
      step3Text: 'Clientes da sua região falam direto com você, sem intermediário.',
      formTitle: 'Bem-vindo, prestador',
      benefitsTitle: 'O que você ganha',
      benefit1: 'Apareça para clientes que já estão procurando na sua região',
      benefit2: 'Anuncie de graça, sem mensalidade para começar',
      benefit3: 'Gerencie seus serviços e sua agenda num só lugar',
      benefit4: 'Fale direto com o cliente, sem comissão sobre o combinado',
      ctaCreateAccount: 'Criar conta grátis',
      haveAccount: 'Já tem conta? Use o formulário para entrar.',
    },
    footer: {
      tagline: 'Entretenimento, eventos e dicas.',
      navigation: 'Navegação',
      categories: 'Categorias',
      social: 'Redes sociais',
      rights: 'Todos os direitos reservados.',
      weatherCredit: 'Previsão do tempo',
      madeWith: 'Feito com ♥',
    },
    default: {
      dashboard: 'Meu Painel',
    },
  },
  'en-US': {
    wizard: WIZARD_PT_BR,
    nav: {
      title: 'Foco Total',
      signIn: 'Sign In',
      signUp: 'Sign Up',
      login: 'Login',
      home: 'Home',
      services: 'Services',
      plans: 'Plans',
      contact: 'Contact',
      theme: 'Theme',
      language: 'Language',
      light: 'Light',
      dark: 'Dark',
      system: 'System',
      color: 'Color',
      blue: 'Blue',
      green: 'Green',
      purple: 'Purple',
      teal: 'Teal',
      red: 'Red',
      orange: 'Orange',
      coral: 'Coral',
      openMenu: 'Open menu',
      closeMenu: 'Close menu',
    },
    home: {
      heroLead: 'Need to',
      heroVerbs: 'fix, teach, renovate, care, paint, assemble',
      heroReducedVerb: 'get it done',
      heroTail: 'near you?',
      heroSub: 'Pros rated by people who already hired them, right here in your area.',
      searchPlaceholder: 'search for a service or pro',
      searchButton: 'Search',
      categoriesTitle: 'Browse by category',
      categoriesAll: 'See all',
      nearbyTitle: 'Whos nearby',
      nearbySub: 'A sample of who is offering services right now.',
      howTitle: 'How it works',
      step1Title: 'Search',
      step1Text: 'Tell us what you need. We show you who does it near you.',
      step2Title: 'Chat',
      step2Text: 'Talk straight to the pro, ask questions, and request a quote.',
      step3Title: 'Arrange',
      step3Text: 'Good to go? Set the date, price, and payment with the pro you picked.',
      joinKicker: 'For service providers',
      joinTitle: 'You do this too?',
      joinText: 'Post your service for free and show up for people searching in your area.',
      joinCta: 'List my service',
    },
    sejaPrestador: {
      metaTitle: 'Become a provider',
      headline: 'Turn your work into more clients',
      subhead:
        'Sign in or create your free account and start showing up for people looking for what you do in your area.',
      stepsTitle: 'How to start',
      step1Title: 'Create your profile',
      step1Text: 'Quick, free account. Add what you do and where you work.',
      step2Title: 'Publish your services',
      step2Text: 'Describe your work, add photos, and set your prices.',
      step3Title: 'Get contacted',
      step3Text: 'Clients in your area reach you directly, no middleman.',
      formTitle: 'Welcome, provider',
      benefitsTitle: 'What you get',
      benefit1: 'Show up for clients already searching in your area',
      benefit2: 'List for free, no subscription to get started',
      benefit3: 'Manage your services and schedule in one place',
      benefit4: 'Talk straight to the client, no commission on what you agree',
      ctaCreateAccount: 'Create free account',
      haveAccount: 'Already have an account? Use the form to sign in.',
    },
    footer: {
      tagline: 'Entertainment, events and tips to enjoy Cuiabá.',
      navigation: 'Navigation',
      categories: 'Categories',
      social: 'Social media',
      rights: 'All rights reserved.',
      weatherCredit: 'Weather forecast',
      madeWith: 'Made with ♥',
    },
    default: {
      dashboard: 'Dashboard',
    },
  },
  'es-ES': {
    wizard: WIZARD_PT_BR,
    nav: {
      title: 'Foco Total',
      signIn: 'Iniciar sesión',
      signUp: 'Registrarse',
      login: 'Login',
      home: 'Inicio',
      services: 'Servicios',
      plans: 'Planes',
      contact: 'Contacto',
      theme: 'Tema',
      language: 'Idioma',
      light: 'Claro',
      dark: 'Oscuro',
      system: 'Sistema',
      color: 'Color',
      blue: 'Azul',
      green: 'Verde',
      purple: 'Morado',
      teal: 'Verde azulado',
      red: 'Rojo',
      orange: 'Naranja',
      coral: 'Coral',
      openMenu: 'Abrir menu',
      closeMenu: 'Cerrar menú',
    },
    home: {
      heroLead: 'Necesitas',
      heroVerbs: 'reparar, enseñar, reformar, cuidar, pintar, montar',
      heroReducedVerb: 'resolverlo',
      heroTail: 'cerca de ti?',
      heroSub: 'Profesionales valorados por quienes ya los contrataron, aquí en tu zona.',
      searchPlaceholder: 'buscar servicio o profesional',
      searchButton: 'Buscar',
      categoriesTitle: 'Explora por categoría',
      categoriesAll: 'Ver todas',
      nearbyTitle: 'Quién está cerca',
      nearbySub: 'Una muestra de quienes están ofreciendo servicios ahora.',
      howTitle: 'Cómo funciona',
      step1Title: 'Busca',
      step1Text: 'Di lo que necesitas. Te mostramos quién lo hace cerca de ti.',
      step2Title: 'Conversa',
      step2Text: 'Habla directo con el profesional, resuelve dudas y pide un presupuesto.',
      step3Title: 'Acuerda',
      step3Text: '¿Todo listo? Acuerda fecha, precio y pago con quien elegiste.',
      joinKicker: 'Para quienes ofrecen servicios',
      joinTitle: '¿Tú también lo haces?',
      joinText: 'Publica tu servicio gratis y aparece para quienes buscan en tu zona.',
      joinCta: 'Publicar mi servicio',
    },
    sejaPrestador: {
      metaTitle: 'Sé un profesional',
      headline: 'Convierte tu trabajo en más clientes',
      subhead:
        'Inicia sesión o crea tu cuenta gratis y empieza a aparecer para quienes buscan lo que haces en tu zona.',
      stepsTitle: 'Cómo empezar',
      step1Title: 'Crea tu perfil',
      step1Text: 'Cuenta rápida y gratuita. Añade tu área de trabajo y dónde atiendes.',
      step2Title: 'Publica tus servicios',
      step2Text: 'Describe lo que haces, añade fotos y define tus precios.',
      step3Title: 'Recibe contactos',
      step3Text: 'Los clientes de tu zona hablan directo contigo, sin intermediarios.',
      formTitle: 'Bienvenido, profesional',
      benefitsTitle: 'Qué ganas',
      benefit1: 'Aparece para clientes que ya están buscando en tu zona',
      benefit2: 'Publica gratis, sin mensualidad para empezar',
      benefit3: 'Gestiona tus servicios y tu agenda en un solo lugar',
      benefit4: 'Habla directo con el cliente, sin comisión sobre lo acordado',
      ctaCreateAccount: 'Crear cuenta gratis',
      haveAccount: '¿Ya tienes cuenta? Usa el formulario para iniciar sesión.',
    },
    footer: {
      tagline: 'Entretenimiento, eventos y consejos para disfrutar Cuiabá.',
      navigation: 'Navegación',
      categories: 'Categorías',
      social: 'Redes sociales',
      rights: 'Todos los derechos reservados.',
      weatherCredit: 'Pronóstico del tiempo',
      madeWith: 'Hecho con ♥',
    },
    default: {
      dashboard: 'Dashboard',
    },
  },
};
