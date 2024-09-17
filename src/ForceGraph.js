import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import * as d3 from 'd3';
import Filter from "./Filter";
import './styles.css'
import SpiderGraph from "./SpiderGraph";
// import SpiderGraph from "./SpiderGraph";


// Hashmap of nodes with their respective values
// Edges and nodes should change with hover

let shouldRerender = true;
let colorsInUse = new Set();
let dataDict = {};
// let annotations = {};
let geneInfo = new Map();
// let filter = null;
// let selectedNode = null;

const ForceGraph  =({ nodes, links, graphMetrics }) => {
    const svgRef = useRef();
    const graphRef = useRef();
    const descriptionRef = useRef();
    const simulationRef = useRef();
    const [selectedNode, setSelectedNode] = useState(null);
    const [selectedLink, setSelectedLink] = useState(null);
    const [tsvData, setTsvData] = useState(null);
    const [annotations, setAnnotations] = useState({});
    const [cancerDriverData, setCancerDriverData] = useState(null);
    // const [colorsInUse, setColorsInUse] = useState(new Set());
    // const [shouldRerender, setShouldRerender] = useState(true);
    const [filter, setFilter] = useState(["","","",""]);

    function setColorsInUse(colors) {
        colorsInUse = colors;
    }

    function translateColors(color) {
        if (color === "rgb(255, 0, 0)") {
            return ">3 related cancers"
        }
        else if (color === "rgb(128, 128, 128)") {
            return "0 related cancers"
        }
        else if (color === "rgb(255,119,0)") {
            return "1 - 3 related cancers"
        }
        else {
            console.log(color)
            return "Filtered gene"
        }
    }




    useEffect(() => {
        let genes = new Set();
        d3.tsv('appic_gene_data.tsv')
            .then(data => {
                setTsvData(data);
            })
            .catch(error => {
                console.error('Error loading TSV file:', error);
            });
        d3.tsv('CancerDrivers.tsv')
            .then(data => {
                setCancerDriverData(data);
            })
            .catch(error => {
                console.error('Error loading TSV file:', error);
            });
        // d3.tsv('CancerDrivers.tsv')
        //     .then(data => {
        //         dataDict.set("cancer_driver", data);
        //     })
        //     .catch(error => {
        //         console.error('Error loading TSV file:', error);
        //     });
        d3.csv('biogrid_all_interactions_final.csv')
            .then(data => {
                // console.log(data)
                // dataDict.set("interactions_biogrid", data);
                dataDict["interactions_biogrid"] = data
                d3.csv('go_biological_process_with_semicolons.csv')
                    .then(data => {
                        console.log(data)
                        // dataDict.set("annotations_go_biological", data);
                        dataDict["annotations_go_biological"] = data
                        d3.csv('go_cellular_component_annotations2.csv')
                            .then(data => {
                                // console.log(data)
                                // dataDict.set("annotations_go_cellular", data);
                                dataDict["annotations_go_cellular"] = data
                                d3.csv('go_molecular_activity_annotations2.csv')
                                    .then(data => {
                                        // console.log(data)
                                        // dataDict.set("annotations_go_molecular", data);
                                        dataDict["annotations_go_molecular"] = data
                                        d3.csv('intact_final_unique_interactions.csv')
                                            .then(data => {
                                                // console.log(data)
                                                // dataDict.set("intact_interactions", data);
                                                dataDict["intact_interactions"] = data
                                                d3.csv('reactome_compartment_annotations.csv')
                                                    .then(data => {
                                                        // console.log(data)
                                                        // dataDict.set("annotations_reactome", data);
                                                        dataDict["reactome_compartment"] = data
                                                        d3.csv('reactome_summation_annotations.csv')
                                                            .then(data => {
                                                                // console.log(data)
                                                                // dataDict.set("annotations_reactome_sum", data);
                                                                dataDict["reactome_summation"] = data
                                                                annotationInitialize(dataDict["annotations_go_biological"], "go_biological", "gene", "annotation")
                                                                annotationInitialize(dataDict["annotations_go_cellular"], "go_cellular", "gene_name", "cellular_component")
                                                                annotationInitialize(dataDict["annotations_go_molecular"], "go_molecular", "gene_name", "molecular_activity")
                                                                annotationInitialize(dataDict["reactome_compartment"], "reactome_compartment", "gene_name", "annotation")
                                                                annotationInitialize(dataDict["reactome_summation"], "reactome_summation", "gene_name", "annotation")
                                                                // console.log(annotations)
                                                                for(let key in dataDict) {
                                                                    for(let row in dataDict[key]) {
                                                                        genes.add(row["gene_name"])
                                                                        // console.log(genes)
                                                                    }
                                                                    // console.log(key)
                                                                }
                                                            })
                                                            .catch(error => {
                                                                console.error('Error loading TSV file:', error);
                                                            });
                                                    })
                                                    .catch(error => {
                                                        console.error('Error loading TSV file:', error);
                                                    });
                                            })
                                            .catch(error => {
                                                console.error('Error loading TSV file:', error);
                                            });
                                    })
                                    .catch(error => {
                                        console.error('Error loading TSV file:', error);
                                    });
                            })
                            .catch(error => {
                                console.error('Error loading TSV file:', error);
                            });
                    })
                    .catch(error => {
                        console.error('Error loading TSV file:', error);
                    });
            })
            .catch(error => {
                console.error('Error loading TSV file:', error);
            });
        function annotationInitialize(data, type, key, column_id) {
            let ann = {"go_biological": "", "go_molecular": "",
                                                "go_cellular": ""};
            // ann.set("go_biological", new Set())
            // console.log(dataDict)
            // console.log(data[0][column_id])
            let count= 0

            for (let i= 0; i < data.length; i++) {
                // console.log(data[i][column_id])
                let gene = data[i][key]
                if(gene in annotations) {

                    annotations[gene][type] = data[i][column_id]
                    // console.log(JSON.stringify(annotations[gene]))
                    // console.log(gene)
                    // if(gene === "BABAM2") {
                    //     console.log(gene)
                    //     annotations[gene][type] = "hello"
                    // }
                    // console.log(gene)
                    // console.log(JSON.stringify(annotations))
                    // console.log(data[i][column_id])
                    // break
                }
                else {
                    annotations[gene] = {"go_biological": "N/A", "go_molecular": "N/A",
                        "go_cellular": "N/A", "reactome_summation": "N/A", "reactome_compartment": "N/A"}
                    // console.log(JSON.stringify(annotations[gene][type]))
                    annotations[gene][type] = data[i][column_id]
                    // if(gene === "BABAM2") {
                    //     console.log(gene)
                    //     annotations[gene][type] = "hello"
                    // }
                    // ann["go_molecular"] = ""
                    // ann["go_cellular"] = ""
                    // console.log(JSON.stringify(annotations))
                    // ann.set("go_biological", new Set())
                }
                // console.log(annotations)
                // count++
                // if (count === 2) {
                //     break
                // }
            }
            // console.log(annotations.toString())
        }
        // d3.csv('go_biological_process_annotations2_modified.csv')
        //     .then(data => {
        //         console.log(data)
        //         dataDict.set("annotations_go_biological", data);
        //     })
        //     .catch(error => {
        //         console.error('Error loading TSV file:', error);
        //     });
        // d3.csv('go_cellular_component_annotations2.csv')
        //     .then(data => {
        //         console.log(data)
        //         dataDict.set("annotations_go_cellular", data);
        //     })
        //     .catch(error => {
        //         console.error('Error loading TSV file:', error);
        //     });
        // d3.csv('go_molecular_activity_annotations2.csv')
        //     .then(data => {
        //         console.log(data)
        //         dataDict.set("annotations_go_molecular", data);
        //     })
        //     .catch(error => {
        //         console.error('Error loading TSV file:', error);
        //     });
        // d3.csv('intact_final_unique_interactions.csv')
        //     .then(data => {
        //         console.log(data)
        //         dataDict.set("intact_interactions", data);
        //     })
        //     .catch(error => {
        //         console.error('Error loading TSV file:', error);
        //     });
        // d3.csv('reactome_compartment_annotations.csv')
        //     .then(data => {
        //         console.log(data)
        //         dataDict.set("annotations_reactome", data);
        //     })
        //     .catch(error => {
        //         console.error('Error loading TSV file:', error);
        //     });
        // d3.csv('reactome_summation_annotations.csv')
        //     .then(data => {
        //         console.log(data)
        //         dataDict.set("annotations_reactome_sum", data);
        //     })
        //     .catch(error => {
        //         console.error('Error loading TSV file:', error);
        //     });
        // console.log(dataDict.keys())

    }, []); // Empty dependency array to run the effect only once on mount
    // Empty dependency array to run the effect only once on mount


    useEffect(() => {
        // const colorsInUse = null;
        const svg = d3.select(svgRef.current);
        const graph = d3.select(graphRef.current);
        const description = d3.selectAll(descriptionRef.current);


        const width = window.screen.availWidth;
        const height = window.screen.availHeight;


        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', handleZoom);


        svg.call(zoom);


        function handleZoom(event) {
            graph.attr('transform', event.transform);
        }


        const simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id(d => d.id).distance(120))
            .force('charge', d3.forceManyBody().strength(-200))
            .force('collide', d3.forceCollide( (d) => d.radius*1.5))
            .force('center', d3.forceCenter(width / 2, height / 2));

        if(shouldRerender) {
            simulationRef.current = simulation;
        }
        else {
            simulationRef.current = null;
        }


        const updateGraph = () => {
            colorsInUse = new Set();
            const link = graph.selectAll('.link')
                .data(links, d => `${d.source.id}-${d.target.id}`)
                .join('line')
                .attr('class', 'link')
                .attr('stroke-width', d => d.weight + 1)
                .style('stroke', 'black')
                .on('click', handleLinkClick)
                .lower();


            const node = graph.selectAll('.node')
                .data(nodes, d => d.id)
                .join('g')
                .attr('class', 'node')
                .on('click', handleNodeClick)
                .call(d3.drag()
                    .on('start', dragStarted)
                    .on('drag', dragging)
                    .on('end', dragEnded));


            nodes.forEach(d => {
                if (shouldRerender) {
                    d.x = Math.random() * width;
                    d.y = Math.random() * height;
                }
                d.cancer = getCancers(d);
                d.radius = getRadius(d)
                d.cancerType = getMoreInfo(d)[0];
                d.organSystem = getMoreInfo(d)[1];
                d.primarySite = getMoreInfo(d)[2];
                d.color = getColor(d);
                colorsInUse.add(d.color)
            });
            console.log(colorsInUse)
            node.selectAll('circle')
                .data(d => [d])
                .join('circle')
                .attr('r', d => getRadius(d))
                .attr('fill', d => getColor(d))
                .attr('stroke', 'black')


            node.selectAll('text')
                .data(d => [d])
                .join('text')
                .text(d => d.name)
                .attr('dy', '0.31em')
                .attr('text-anchor', 'middle')
                .style('font-size', '10px');


            simulation.nodes(nodes);
            // simulation.force('link').links(links);
            simulation.alpha(1).restart();
            simulation.on('tick', () => {
                node.attr('transform', d => `translate(${d.x},${d.y})`);
                link.attr('x1', d => d.source.x)
                    .attr('y1', d => d.source.y)
                    .attr('x2', d => d.target.x)
                    .attr('y2', d => d.target.y);
            });
        };
        shouldRerender = false;

        const handleNodeClick = (event, d) => {
            const listCancers = getCancers(d);
            console.log(d)
            setSelectedNode({ ...d, "cancer": listCancers.join(", ") });
        };

        const handleLinkClick = (event, d) => {
            console.log(d)
            setSelectedLink(d)
        };


        const dragStarted = (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        };


        const dragging = (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
        };


        const dragEnded = (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        };

        // function updateValues(filterChoice) {
        //     setFilter(filterChoice)
        //     setColorsInUse(new Set())
        // }

        const getColor = (d) => {
            // updateLegend(d);
            const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
            // if(links.filter(link => link.source === d || link.target === d).length > 3) {
            // console.log(selectedDropdownValue == d.id)
            // if (selectedDropdownValue && d.cancer.indexOf(selectedDropdownValue) >= 0) {
            //     return "rgb(255, 255, 0)";
            // }
            if(JSON.stringify(filter) !== JSON.stringify(["","","",""]) && (d.cancer.join(", ").toLowerCase().includes(filter[0].toLowerCase()) && d.cancerType.toLowerCase().includes(filter[1].toLowerCase())
                && d.organSystem.toLowerCase().includes(filter[2].toLowerCase()) && d.primarySite.toLowerCase().includes(filter[3].toLowerCase()))) {
                return "rgb(255, 255, 0)";
            }
            if(d.cancer.length >= 3) {
                return "rgb(255, 0, 0)";
            }
            else if(d.cancer.length === 1 && d.cancer[0] === "None") {
                return "rgb(128, 128, 128)";
            }
            else {
                return "rgb(255,119,0)";
            }
            return colorScale(d.name);
        };


        const getRadius = (d) => {
            const baselineSize = 15;
            const scaleFactor = 2;
            return baselineSize + links.filter(link => link.source === d || link.target === d).length * scaleFactor;
        };

        const getCancers = (d) => {
            if (!tsvData) {
                console.error('TSV data is not yet loaded.');
                return;
            }
            const matchingEntries = tsvData.filter(entry => entry.gene === String(d.id));


            if (matchingEntries.length > 0) {
                const extractedAttribute = matchingEntries.map(entry => entry.cancer); // Replace 'someAttribute' with the actual attribute you want to extract
                return([...(new Set(extractedAttribute))]); // Include extractedAttribute in the selectedNode state
            } else {
                return(["None"]);
            }
        };

        const getMoreInfo = (d) => {
            if (!cancerDriverData) {
                console.error('TSV data is not yet loaded.');
                return;
            }

            const matchingEntries = cancerDriverData.filter(entry => entry.symbol === String(d.id));

            if (matchingEntries.length > 0) {
                const extractedType = matchingEntries.map(entry => entry.type); // Replace 'someAttribute' with the actual attribute you want to extract
                const extractedOrganSystem = matchingEntries.map(entry => entry.organ_system);
                const extractedPrimarySIte = matchingEntries.map(entry => entry.primary_site);
                return([[...(new Set(extractedType))].join(", "),
                    [...(new Set(extractedOrganSystem))].join(", "),
                    [...(new Set(extractedPrimarySIte))].join(", ")]); // Include extractedAttribute in the selectedNode state
            } else {
                return(["", "", ""]);
            }
        }


        updateGraph();


        const handleResize = () => {
            const newWidth = window.screen.availWidth;
            const newHeight = window.screen.availHeight;
            svg.attr('width', newWidth).attr('height', newHeight);
            // simulation.force('center', d3.forceCenter(newWidth / 2, newHeight / 2));
            simulation.restart();
        };


        window.addEventListener('resize', handleResize);
        // handleResize();


        return () => {
            handleResize();
            simulation.stop();
            window.removeEventListener('resize', handleResize);
        };
    }, [nodes, links, tsvData, cancerDriverData, filter]);




    return (

        <div>
            {selectedNode && <div
                ref={descriptionRef}
                className="description-box"
                style={{
                    position: 'absolute',
                    top: '25px',
                    left: '10px',
                    padding: '10px',
                    width: 350,
                    height: 650,
                    backgroundColor: 'white',
                    border: '1px solid black',
                    borderRadius: '5px',
                    zIndex: 2,
                    overflowY: "scroll",
                    overflowX: "scroll"
                }}
            >
                <p>Gene: {selectedNode.id}</p>
                <p>Cancers: {selectedNode.cancer || "N/A"}</p>
                <p>Sequencing Technique: {selectedNode.cancerType || "N/A"}</p>
                <p>Organ System: {selectedNode.organSystem || "N/A"}</p>
                <p>Primary Site: {selectedNode.primarySite || "N/A"}</p>
                <p><u>GO Annotations:</u></p>
                <p>Biological Process: {(selectedNode.id in annotations && annotations[selectedNode.id]["go_biological"]) || "N/A"}</p>
                <p>Cellular Component: {(selectedNode.id in annotations && annotations[selectedNode.id]["go_cellular"]) || "N/A"}</p>
                <p>Molecular Function: {(selectedNode.id in annotations && annotations[selectedNode.id]["go_molecular"]) || "N/A"}</p>
                <p><u>Reactome Annotations:</u></p>
                <p>Reactome Compartment: {(selectedNode.id in annotations && annotations[selectedNode.id]["reactome_compartment"]) || "N/A"}</p>
                <p>Reactome Summation: {(selectedNode.id in annotations && annotations[selectedNode.id]["reactome_summation"]) || "N/A"}</p>
                <button onClick={() => setSelectedNode(null)}>Close</button>
            </div> }

                    {selectedLink && <div
                        ref={descriptionRef}
                        className="description-box"
                        style={{
                            position: 'absolute',
                            top: '25px',
                            left: '10px',
                            padding: '10px',
                            width: 350,
                            height: 250,
                            backgroundColor: 'white',
                            border: '1px solid black',
                            borderRadius: '5px',
                            zIndex: 2,
                            overflowY: "scroll",
                            overflowX: "scroll"
                        }}
                    >
                        <p>Genes: {selectedLink.source.id} and {selectedLink.target.id}</p>
                        <p>Interaction found in {[...selectedLink.interactions].join(", ")}</p>
                        <button onClick={() => setSelectedLink(null)}>Close</button>
                    </div> }


                    <div style={{
                        zIndex: 0,
                        position: "relative"
                    }}>
                <Filter onSubmit={setFilter} changeColor={setColorsInUse}/>
                {/*<SpiderGraph></SpiderGraph>*/}
                {shouldRerender = false}
                        <div style={{
                            position: 'absolute',
                            top: '25px',
                            right: '10px',
                            padding: '10px',
                            backgroundColor: 'white',
                            border: '1px solid black',
                            borderRadius: '5px',
                            zIndex: 3
                        }} className="legend">

                            {
                                [...colorsInUse].map((color) => (
                                    <p><span style={{backgroundColor: color, display: "inline-block", width: 15,
                                        height: 15}}> </span>{translateColors(color)}</p>
                                ))}

                        </div>
                        <svg ref={svgRef} width="50%" height="100%" style={{position: "relative"}}>
                            <g ref={graphRef}></g>
                        </svg>
                        <div style={{position: 'absolute', top: '420px', left:'-30px'}}>
                            <SpiderGraph data={graphMetrics} isComparative={false}></SpiderGraph>
                        </div>
            </div>

            {/*{(nodes !== [] && links !== []) &&*/}
            {/*    <SpiderGraph/>}*/}
        </div>

    );
};


export default ForceGraph;

