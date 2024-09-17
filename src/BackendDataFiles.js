import React, { useEffect, useRef, useState } from 'react';
import Dropdown from './Dropdown';
import * as d3 from 'd3';


const BackEndDataFiles = ({ nodes, links }) => {
    const svgRef = useRef();
    const graphRef = useRef();
    const descriptionRef = useRef();
    const simulationRef = useRef();
    const [selectedNode, setSelectedNode] = useState(null);
    const [tsvData, setTsvData] = useState(null);
    const [selectedDropdownValue, setSelectedDropdownValue] = useState(null);


    useEffect(() => {
        d3.tsv('appic_gene_data.tsv')
            .then(data => {
                setTsvData(data);
            })
            .catch(error => {
                console.error('Error loading TSV file:', error);
            });
    }, [1]); // Empty dependency array to run the effect only once on mount
    // Empty dependency array to run the effect only once on mount


    useEffect(() => {
        const svg = d3.select(svgRef.current);
        const graph = d3.select(graphRef.current);
        const description = d3.select(descriptionRef.current);


        const width = window.innerWidth;
        const height = window.innerHeight;


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
            .force('center', d3.forceCenter(width / 2, height / 2));


        simulationRef.current = simulation;


        const updateGraph = () => {
            const link = graph.selectAll('.link')
                .data(links, d => `${d.source.id}-${d.target.id}`)
                .join('line')
                .attr('class', 'link')
                .style('stroke', 'black')
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
                d.x = Math.random() * width;
                d.y = Math.random() * height;
                d.cancer = getCancers(d);
            });


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
            simulation.force('link').links(links);
            simulation.alpha(1).restart();


            simulation.on('tick', () => {
                node.attr('transform', d => `translate(${d.x},${d.y})`);
                link.attr('x1', d => d.source.x)
                    .attr('y1', d => d.source.y)
                    .attr('x2', d => d.target.x)
                    .attr('y2', d => d.target.y);
            });
        };


        const handleNodeClick = (event, d) => {
            const listCancers = getCancers(d);
            setSelectedNode({ ...d, "cancer": listCancers.join(", ") });
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


        const getColor = (d) => {
            const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
            // if(links.filter(link => link.source === d || link.target === d).length > 3) {
            // console.log(selectedDropdownValue == d.id)
            if (selectedDropdownValue && d.cancer.indexOf(selectedDropdownValue) >= 0) {
                return "rgb(255, 255, 0)";
            }
            if(getCancers(d).length >= 3) {
                // console.log(d.cancer)
                return "rgb(255, 0, 0)";
            }
            else if(getCancers(d).length == 1 && getCancers(d)[0] == "None") {
                return "rgb(128, 128, 128)";
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


        updateGraph();


        const handleResize = () => {
            const newWidth = window.innerWidth;
            const newHeight = window.innerHeight;
            svg.attr('width', newWidth).attr('height', newHeight);
            simulation.force('center', d3.forceCenter(newWidth / 2, newHeight / 2));
            simulation.restart();
        };


        window.addEventListener('resize', handleResize);


        return () => {
            simulation.stop();
            window.removeEventListener('resize', handleResize);
        };
    }, [nodes, links, tsvData, selectedDropdownValue]);




    return (
        <div>
            <Dropdown onChange={setSelectedDropdownValue}/>
            {selectedNode && (
                <div
                    ref={descriptionRef}
                    className="description-box"
                    style={{
                        position: 'absolute',
                        top: '25px',
                        left: '10px',
                        padding: '10px',
                        backgroundColor: 'white',
                        border: '1px solid black',
                        borderRadius: '5px',
                    }}
                >
                    <p>Gene: {selectedNode.id}</p>
                    <p>Cancers: {selectedNode.cancer}</p>
                    <button onClick={() => setSelectedNode(null)}>Close</button>
                </div>
            )}


            <svg ref={svgRef} width="100%" height="100%">
                <g ref={graphRef}></g>
            </svg>
        </div>
    );
};


export default BackEndDataFiles;

