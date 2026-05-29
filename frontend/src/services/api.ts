import axios from 'axios'

const API_BASE_URL = 'http://localhost:8000'

const API = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 15000,
  headers: import.meta.env.VITE_API_KEY
    ? { 'X-API-Key': import.meta.env.VITE_API_KEY }
    : {},
});

export const uploadFileDirect = async (file: File, graphIndex: number) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await axios.post(`${API_BASE_URL}/upload?graph_index=${graphIndex}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  });
  return response;
};

export const fetchGraph = async (graphIndex: number = 0) => {
  const response = await API.get(`/graph-data/${graphIndex}`)
  return response
}

export const analyzeGraph = async (graphIndex: number = 0) => {
  const response = await API.post('/analyze-graph', { graph_index: graphIndex })
  return response
}

export const getGeneDetails = async (gene: string) => {
  const response = await API.get(`/gene/${gene}`)
  return response
}

export const resetGraph = async (graphIndex: number = 0) => {
  const response = await API.post('/reset-graph', { graph_index: graphIndex })
  return response
}

export const removeGene = async (gene: string, graphIndex: number = 0) => {
  const response = await API.post('/remove-node', { node_id: gene, graph_index: graphIndex })
  return response
}

export const getGraphletAnalysis = async (graphIndex: number = 0, size: number = 3) => {
  const response = await API.get('/graphlet-analysis', {
    params: { graph_index: graphIndex, size },
    timeout: 120000,
  })
  return response
}

export const compareGraphlets = async (graphIndex1: number = 0, graphIndex2: number = 1, size: number = 3) => {
  const response = await API.get('/compare-graphlets', {
    params: { graph_index1: graphIndex1, graph_index2: graphIndex2, size },
    timeout: 120000,
  })
  return response
}

export const searchGenes = async (keyword: string, minDegree: number, maxDegree: number, graphIndex: number) => {
  const response = await API.get('/search', { 
    params: { 
      keyword: keyword.trim(),
      min_degree: minDegree,
      max_degree: maxDegree,
      graph_index: graphIndex 
    } 
  })
  return response
}

export const getSharedGenes = async () => {
  const response = await API.get('/shared-genes')
  return response
}

export const getGeneEnrichment = async (geneSymbol: string) => {
  const response = await API.get(`/gene-enrichment/${geneSymbol}`, { timeout: 30000 });
  return response;
}

export const getComparativeAnalysis = async (graphIndex1: number, graphIndex2: number) => {
  const response = await API.get('/comparative-analysis', {
    params: {
      graph_index1: graphIndex1,
      graph_index2: graphIndex2,
    },
    timeout: 120000,
  });
  return response;
}

export const getInteraction = async (gene1: string, gene2: string) => {
  const response = await API.get(`/interaction/${gene1}/${gene2}`);
  return response;
}

export const getExpressionData = async (graphIndex: number) => {
  return await API.get(`/expression-data/${graphIndex}`);
};

export const uploadExpressionData = async (graphIndex: number, data: any) => {
  return await API.post(`/expression-data/${graphIndex}`, data);
};

export const getAllGeneAnnotations = async (gene: string, k: number = 5, graphIndex: number = -1) => {
  const response = await API.post(`/annotate_all_views?k=${k}&graph_index=${graphIndex}`, { gene }, { timeout: 120000 });
  return response;
};

export const sendGeneChatMessage = async (
  gene: string,
  message: string,
  conversation_history: Array<{ role: string; content: string }>
) => {
  const response = await API.post('/chat', { gene, message, conversation_history }, { timeout: 120000 });
  return response;
};

export const streamChatMessage = (
  gene: string,
  message: string,
  conversation_history: Array<{ role: string; content: string }>
): Promise<Response> => {
  return fetch(`${API_BASE_URL}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(import.meta.env.VITE_API_KEY ? { 'X-API-Key': import.meta.env.VITE_API_KEY } : {}),
    },
    credentials: 'include',
    body: JSON.stringify({ gene, message, conversation_history }),
  });
};

export const sendMultiGeneChatMessage = async (
  genes: string[],
  message: string,
  conversation_history: string
) => {
  const response = await API.post('/chat', { gene: genes.join(','), message, conversation_history }, { timeout: 120000 });
  return response;
};

export const llmTest = async () => {
  const response = await API.get('/llm-test', { timeout: 30000 })
  return response
};

export const postMultiAnnotate = async (genes: string[]) => {
  const response = await API.post('/multi-annotate', { genes }, { timeout: 120000 });
  return response;
};

export const promoteGraph = async () => {
  const response = await API.post('/promote-graph');
  return response.data;
};

export const clusterGraph = async (graphIndex: number, algorithm: string) => {
  const response = await API.post('/cluster', { graph_index: graphIndex, algorithm }, { timeout: 120000 });
  return response.data;
};

export const getLLMSettings = async () => {
  return await API.get('/settings/llm');
};

export const saveLLMSettings = async (config: {
  provider: string;
  api_key: string;
  model: string;
  base_url?: string;
}) => {
  return await API.post('/settings/llm', config);
};
