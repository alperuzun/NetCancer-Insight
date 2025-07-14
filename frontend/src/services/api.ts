import axios from 'axios'

const API = axios.create({ baseURL: 'https://netcancer-insight.onrender.com' })

// Add request interceptor for logging
API.interceptors.request.use(request => {
  console.log('API Request:', {
    url: request.url,
    method: request.method,
    params: request.params,
    data: request.data
  });
  return request;
});

// Add response interceptor for logging
API.interceptors.response.use(
  response => {
    console.log('API Response:', {
      url: response.config.url,
      status: response.status,
      data: response.data
    });
    return response;
  },
  error => {
    console.error('API Error:', {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    return Promise.reject(error);
  }
);

export const uploadFile = (file: File, graphIndex: number) => {
  const form = new FormData()
  form.append('file', file)
  return API.post('/upload', { file: form, graph_index: graphIndex })
}

export const uploadFileDirect = async (file: File, graphIndex: number) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await axios.post(`https://netcancer-insight.onrender.com/upload?graph_index=${graphIndex}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
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
    params: { 
      graph_index: graphIndex,
      size: size
    } 
  })
  return response
}

export const compareGraphlets = async (graphIndex1: number = 0, graphIndex2: number = 1, size: number = 3) => {
  const response = await API.get('/compare-graphlets', { 
    params: { 
      graph_index1: graphIndex1,
      graph_index2: graphIndex2,
      size: size
    } 
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
  const response = await API.get(`/gene-enrichment/${geneSymbol}`);
  return response;
}

export const getComparativeAnalysis = async (graphIndex1: number, graphIndex2: number) => {
  const response = await API.get('/comparative-analysis', {
    params: {
      graph_index1: graphIndex1,
      graph_index2: graphIndex2,
    }
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

export const getAllGeneAnnotations = async (gene: string, k: number = 5) => {
  const response = await API.post('/annotate_all_views?k=' + k, { gene });
  return response;
};

export const sendGeneChatMessage = async (gene: string, message: string, conversation_history: string) => {
  const response = await API.post('/chat', {
    gene,
    message,
    conversation_history
  });
  return response;
};

export const sendMultiGeneChatMessage = async (
  genes: string[],
  message: string,
  conversation_history: string
) => {
  const response = await API.post('/chat', {
    gene: genes.join(','),
    message,
    conversation_history
  });
  return response;
};

export const postMultiAnnotate = async (genes: string[]) => {
  const response = await API.post('/multi-annotate', { genes });
  return response;
};