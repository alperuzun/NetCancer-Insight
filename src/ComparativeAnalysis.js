/*
Into both force graphs pass in a state setter for the panel that provides node info and make both force graphs
use that so that when you render the info panel there is no duplicates
*/



import React, { useState } from 'react';
import {PanelGroup, Panel, PanelResizeHandle} from "react-resizable-panels";
// import {
//     BrowserRouter as Router,
//     Routes,
//     Route,
// } from "react-router-dom";
import DataPreprocessing from "./DataPreprocessing";
import ForceGraph from "./ForceGraph";
import SpiderGraph from "./SpiderGraph";
import InfoButton from "./InfoButton";

function compareNodes(nodes1, nodes2) {
    let node_set1 = new Set()
    let node_set2 = new Set()
    let shared = []
    for (let node of nodes1) {
        node_set1.add(node["name"])
    }
    for (let node of nodes2) {
        node_set2.add(node["name"])
    }
    for (let node of node_set1) {
        if (node_set2.has(node)) {
            shared.push(node)
        }
    }
    console.log(shared)
    return shared;
}

function getNodes(nodes_attrs) {
    let node_set = new Set()
    for (let node of nodes_attrs) {
        node_set.add(node["name"])
    }
    return [...node_set]
}

function findShortestPath(graph, startNode, targetNode) {
    // If start and target nodes are the same, distance is 0
    // console.log(startNode)
    if (startNode === targetNode) return 0;

    // Initialize a queue for BFS
    let queue = [];
    // Initialize a visited set to avoid revisiting nodes
    let visited = new Set();
    // Initialize a map to track the distance from the start node
    let distance = {};

    // Enqueue the start node and set its distance to 0
    queue.push(startNode);
    visited.add(startNode);
    distance[startNode] = 0;

    // Perform BFS
    while (queue.length > 0) {
        let currentNode = queue.shift();

        // Get all neighbors of the current node
        // console.log(graph)
        // console.log(currentNode)
        for (let neighbor of graph[currentNode]) {
            if (!visited.has(neighbor)) {
                // Mark neighbor as visited
                visited.add(neighbor);
                // Update distance of neighbor
                distance[neighbor] = distance[currentNode] + 1;
                // Enqueue the neighbor
                queue.push(neighbor);

                // If we reach the target node, return its distance
                if (neighbor === targetNode) {
                    return distance[neighbor];
                }
            }
        }
    }

    // If target node is not reachable, return -1
    return -1;
}

function calcSingleDistance(graph, genes) {
    const allPathLengths = {}
    let sum = 0
    let count = 0
    for (let gene1 of genes) {
        if (! (gene1 in allPathLengths) ) {
            allPathLengths[gene1] = {}
        }
        for (let gene2 of genes) {
            allPathLengths[gene1][gene2] = findShortestPath(graph, gene1, gene2)
            sum += allPathLengths[gene1][gene2]
            count += 1
        }
    }

    return (sum / count)
}

function combineGeneSet(gene_set1, gene_set2) {
    const all_genes = new Set()
    for (var gene in gene_set1) {
        if (! (gene in all_genes)) {
            all_genes.add(gene)
        }
    }
    for (var gene in gene_set2) {
        if (! (gene in all_genes)) {
            all_genes.add(gene)
        }
    }
    return all_genes
}

function constructCombinedGraph(graph1, graph2) {
    const result = {}

    function mergeNeighbors(key, neighbors) {
        if (!result[key]) {
            result[key] = new Set();
        }
        console.log(neighbors)
        if (neighbors) {
            for (const neighbor of neighbors) {
                result[key].add(neighbor); // Add elements to the set, avoiding duplicates
            }
        }
    }

    for (const key in graph1) {
        console.log(graph1)
        mergeNeighbors(key, graph1[key])
    }

    for (const key in graph2) {
        mergeNeighbors(key, graph1[key])
    }

    return result
}

function calcTwoSetDistance(graph, genes1, genes2) {
    const allPathLengths = {}
    let sum = 0
    let count = 0
    for (let gene1 of genes1) {
        if (! (gene1 in allPathLengths) ) {
            allPathLengths[gene1] = {}
        }
        for (let gene2 of genes2) {
            allPathLengths[gene1][gene2] = findShortestPath(graph, gene1, gene2)
            sum += allPathLengths[gene1][gene2]
            count += 1
        }
    }

    for (let gene1 of genes2) {
        if (! (gene1 in allPathLengths) ) {
            allPathLengths[gene1] = {}
        }
        for (let gene2 of genes1) {
            allPathLengths[gene1][gene2] = findShortestPath(graph, gene1, gene2)
            sum += allPathLengths[gene1][gene2]
            count += 1
        }
    }

    return (sum / count)
}

function calcSeparationScore(graph1, genes1, graph2, genes2) {
    const dA = calcSingleDistance(graph1, genes1)
    const dB = calcSingleDistance(graph2, genes2)

    const combinedGraph = constructCombinedGraph(graph1, graph2)
    const dAB = calcTwoSetDistance(combinedGraph, genes1, genes2)
    const sAB = dAB - (dA + dB) / 2.0
    return sAB
}



function handleGraphMetrics(graphMetrics1, graphMetrics2) {
    let new_metrics = []
    let length = graphMetrics1.length
    for (var row = 0; row < length; row++) {
        let graph_metric = {"name": graphMetrics1[row]["name"], "Graph 1": graphMetrics1[row]["x"], "Graph 2": graphMetrics2[row]["x"]}
        new_metrics.push(graph_metric)
    }
    console.log(new_metrics)
    return (new_metrics)
}


const ComparativeAnalysis = ({nodes1, nodes2, graphMetrics1, graphMetrics2, nodeEdges1, nodeEdges2}) => {
    const [analysisExpanded, setAnalysisExpanded] = useState(false)

    const handleButtonClick = () => {
        if (!analysisExpanded) {
            if (nodes1 && nodes2 && graphMetrics1 && graphMetrics2 && nodeEdges1 && nodeEdges2) {
                setAnalysisExpanded(!analysisExpanded)
            }
        }
        else {
            setAnalysisExpanded(!analysisExpanded)
        }
    }

    const showAnalysis = () => {
        let data = handleGraphMetrics(graphMetrics1, graphMetrics2)
        let node_comparisons = compareNodes(nodes1, nodes2)
        let node_set1 = getNodes(nodes1)
        let node_set2 = getNodes(nodes2)
        return (
            <div
                className="comparative-analysis-box"
                style={{
                    position: 'absolute',
                    top: '25px',
                    left: '20px',
                    padding: '10px',
                    width: 550,
                    height: 650,
                    backgroundColor: 'white',
                    border: '1px solid black',
                    borderRadius: '5px',
                    zIndex: 2,
                    overflowY: "scroll",
                    overflowX: "scroll"
                }}
            >
                <p>Shared Genes: {node_comparisons.join(", ")}</p>
                <p>Separation Score: {calcSeparationScore(nodeEdges1, node_set1, nodeEdges2, node_set2)}</p>
                <InfoButton infoText="A negative score indicates that the two gene networks do not overlap, while a positive score indicates that the two gene networks do overlap"/>
                <SpiderGraph data={data} isComparative={true}></SpiderGraph>
                <button onClick={() => setAnalysisExpanded(null)}>Close</button>
            </div>
        )
    }


    return (
        <>
            <button onClick={handleButtonClick}>Show Comparative Analysis</button>
            {analysisExpanded && showAnalysis()}
        </>



    );
};

export default ComparativeAnalysis;

