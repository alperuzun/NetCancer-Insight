import React, {useState} from 'react';
import * as d3 from 'd3';

const DataPreprocessing = ({onNodes, onLinks, onGraphMetrics, onNodeEdges}) => {
    // const [interactions, setInteractions] = useState({})

    function parseTSV(inputString) {
        var rawData = splitText(inputString);
        const data = addNodesAndEdges(rawData);
        return(data);
    }

    function splitText(textString) {
        var lines = textString.split(/[\r\n]+/);
        var attributes = [];
        for(var i = 0; i < lines.length; i++) {
            attributes[i] = lines[i].split(/[\t]+/);
        }
        return(attributes);
    }

    function analyzeInteractionData(data, interaction_df, gene1_key, gene2_key, interaction_key) {
        interaction_df[interaction_key] = {}
        for(let row of data) {
            let gene1 = row[gene1_key]
            let gene2 = row[gene2_key]

            if (!(gene1 in interaction_df[interaction_key])) {
                interaction_df[interaction_key][gene1] = new Set()
            }
            if (!(gene2 in interaction_df[interaction_key])) {
                interaction_df[interaction_key][gene2] = new Set()
            }

            interaction_df[interaction_key][gene1].add(gene2)
            interaction_df[interaction_key][gene2].add(gene1)
        }
        return(interaction_df)
    }


    function getInteractionData() {
        let interaction_df = {}
        return new Promise(resolve =>
            d3.csv('string_ppis_final.csv')
            .then(data => {
                interaction_df = analyzeInteractionData(data, interaction_df, "gene1", "gene2", "String")
                d3.csv('biogrid_all_interactions_final.csv')
                    .then(data2 => {
                        // console.log(data2)
                        interaction_df = analyzeInteractionData(data2, interaction_df, "official_symbol_a", "official_symbol_b", "BioGrid")
                        d3.csv('intact_final_unique_interactions.csv')
                            .then(data3 => {
                                // console.log(data2)
                                interaction_df = analyzeInteractionData(data3, interaction_df, "MoleculeA", "MoleculeB", "Intact")
                                resolve(interaction_df)
                            })
                    })
            }))

        // return (interaction_df)
    }


    // let all_data = {}
    // let interaction_df = {}
    // interaction_df["string"] = {}
    // return new Promise(resolve =>
    //     d3.csv('string_ppis_final.csv')
    //         .then(data => {
    //             all_data["string"] = data
    //             d3.csv('intact_final_unique_interactions.csv')
    //                 .then(data2 => {
    //                     all_data["intact"] = data2
    //                     d3.csv('bio')
    //
    //                     // console.log(data)
    //                     for (let row of data) {
    //                         let gene1_key = "gene1"
    //                         let gene2_key = "gene2"
    //                         let gene1 = row[gene1_key]
    //                         let gene2 = row[gene2_key]
    //
    //                         if (!(gene1 in interaction_df["string"])) {
    //                             interaction_df["string"][gene1] = new Set()
    //                         }
    //                         if (!(gene2 in interaction_df["string"])) {
    //                             interaction_df["string"][gene2] = new Set()
    //                         }
    //
    //                         interaction_df["string"][gene1].add(gene2)
    //                         interaction_df["string"][gene2].add(gene1)
    //                     }
    //                     return (interaction_df)
    //                 })
    //         }))

    function calculateGraphMetrics(nodes_set, edges_from_node) {
        // console.log(nodes_set)
        // console.log(edges_from_node)
        let graphMetrics = {}
        let num_nodes = nodes_set.size
        let total_edges = 0
        let clustering_coefficient = 0
        let max_k = -1
        for (let node of nodes_set) {
            let num_edges = edges_from_node[node].size
            // console.log(num_edges)
            total_edges += num_edges
            clustering_coefficient += (2*num_edges) / ( (num_nodes) * (num_nodes - 1) )
            if (num_edges > max_k) {
                max_k = num_edges
            }
        }
        let graph_density = (2 * total_edges) / ( (num_nodes) * (num_nodes - 1))
        let centralization = (num_nodes / (num_nodes - 2) ) * ( (max_k / (num_nodes - 1)) - graph_density)
        clustering_coefficient /= num_nodes
        console.log(clustering_coefficient)
        console.log(graph_density)
        console.log(centralization)
        let graph_metrics = [
            { name: 'Graph density', x: graph_density },
            { name: 'Clustering Coefficient', x: clustering_coefficient },
            { name: 'Centralization', x: centralization }]
        onGraphMetrics(graph_metrics)
    }


    async function addNodesAndEdges(df) {
        const interactions = await getInteractionData()
        console.log(interactions)
        let nodes_set = new Set();
        let edges_from_node = {}
        let edges = [];
        let nodes = [];
        for (var row = 1; row < df.length - 1; row++) {
            let node1 = df[row][0]
            let node2 = df[row][1]

            if (!nodes_set.has(node1)) {
                nodes_set.add(node1)
                nodes.push({"id":node1, "name":node1})
            }

            if (!nodes_set.has(node2)) {
                nodes_set.add(node2)
                nodes.push({"id":node2, "name":node2})
            }

            if (!(node1 in edges_from_node)) {
                edges_from_node[node1] = new Set()
            }

            if (!(node2 in edges_from_node)) {
                edges_from_node[node2] = new Set()
            }

            let count = new Set()
            // console.log(interactions)
            for (let key in interactions) {
                if( (node1 in interactions[key] && interactions[key][node1].has(node2))
                    || (node2 in interactions[key] && interactions[key][node2].has(node1) )) {
                    count.add(key)
                }
            }
            // console.log(count)
            edges_from_node[node1].add(node2)
            edges_from_node[node2].add(node1)
            edges.push({"source": node1, "target": node2, "value": df[row][2], "weight": count.size, "interactions": count})
        }
        return({"nodes": nodes, "links": edges, "node_set": nodes_set, "edges_from_node": edges_from_node})
    }

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        const fileType = file.type;
        // console.log(fileType)
        // == "text/tab-separated-values")
        if (file) {
            const reader = new FileReader();

            reader.onload = async (e) => {
                if(fileType == "application/json") {
                    try {
                        const data = JSON.parse(e.target.result);
                        onNodes(data.nodes || []);
                        onLinks(data.links || []);
                    } catch (error) {
                        console.error('Error parsing JSON file:', error);
                    }
                }
                else if(fileType == "text/tab-separated-values") {
                    // const interaction_data = await getInteractionData()
                    // setInteractions(interaction_data)
                    // console.log(interaction_data)
                    parseTSV(e.target.result).then( (data) => {
                        calculateGraphMetrics(data.node_set, data.edges_from_node)
                        // console.log(findShortestPath(data.edges_from_node, "PLCG2", "GNB1"))
                        // console.log(JSON.stringify(findAllPathLengths(data.edges_from_node, data.node_set)))
                        onNodes(data.nodes || []);
                        onLinks(data.links || []);
                        onNodeEdges(data.edges_from_node || []);
                    })
                    // getInteractionData().then( (interactions) => {
                    //     setTimeout(() => {
                    //         const data = parseTSV(e.target.result, interactions)
                    //         onNodes(data.nodes || []);
                    //         onLinks(data.links || []);
                    //     }, 10000)
                    //     console.log(interactions)
                    // })
                }
                else {
                    console.log("Please upload a valid file type")
                }
            };

            reader.readAsText(file);
        }
    };

    return (
        <div>
            <input type="file" accept=".json, .tsv" onChange={handleFileUpload} />
        </div>
    );
};

export default DataPreprocessing;
