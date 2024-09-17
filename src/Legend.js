import React, {useState, useEffect} from "react";

const Legend = ({colorData}) => {
    const [colorsOnGraph, setColorsOnGraph] = useState([]);

    useEffect(() => {
        console.log()
        setColorsOnGraph([...colorData])
    }, colorsOnGraph)

    function translateColors(color) {
        if (color === "rgb(255,0,0)") {
            return ">3 related cancers"
        }
        else if (color === "rgb(128, 128, 128)") {
            return "0 related cancers"
        }
        else if (color === "rgb(255, 119, 0)") {
            return "1 - 3 related cancers"
        }
        else {
            return "Filtered gene"
        }
    }


    return (
        <div style={{
            position: 'absolute',
            top: '25px',
            right: '10px',
            padding: '10px',
            backgroundColor: 'white',
            border: '1px solid black',
            borderRadius: '5px',
        }}>
            <fieldset>
                {
                    colorsOnGraph.map((color) => (
                   <label>{translateColors(color)}</label>
                ))}
            </fieldset>
        </div>);
}

export default Legend;