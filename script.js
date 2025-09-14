let testData = [];
let qAmount = 0;

async function processFile() {
    
    qAmount = 0;

    const fileInput = document.getElementById('docxFile');
    const errorDiv = document.getElementById('error');
    const loadingDiv = document.getElementById('loading');

    errorDiv.textContent = '';
    errorDiv.classList.add("hidden");
    loadingDiv.style.display = 'block';

    if (!fileInput.files.length) {
        errorDiv.textContent = 'Пожалуйста, выберите файл';
        errorDiv.classList.remove("hidden");
        loadingDiv.style.display = 'none';
        return;
    }

    const file = fileInput.files[0];

    try {
        const arrayBuffer = await file.arrayBuffer();

        // Конвертируем DOCX в HTML с изображениями
        const result = await mammoth.convertToHtml(
            { arrayBuffer },
            {
                convertImage: mammoth.images.imgElement(function (image) {
                    return image.read("base64").then(function (imageBuffer) {
                        return {
                            src: "data:" + image.contentType + ";base64," + imageBuffer
                        };
                    });
                })
            }
        );

        saveTextFileRobust("questions.txt", result.value);
        
        // Парсим вопросы
        testData = parseQuestions(result.value);

        const mix = document.getElementById('mix');
        if (mix.checked) {
            testData = shuffleArray(testData);
        }
        

        if (testData.length === 0) {
            errorDiv.textContent = 'Не удалось найти вопросы в файле.';
            errorDiv.classList.remove("hidden");
            loadingDiv.style.display = 'none';
            return;
        }

        displayTest(testData);
        displayGroupSelector(); // показываем селектор групп
        loadingDiv.style.display = 'none';

    } catch (error) {
        errorDiv.textContent = 'Ошибка при обработке файла: ' + error.message;
        errorDiv.classList.remove("hidden");
        loadingDiv.style.display = 'none';
        console.error('Error:', error);
    }
}

function parseQuestions(htmlContent) {
    const questions = [];
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    const elements = Array.from(tempDiv.children);
    let currentQuestion = null;
    let currentGroup = "Общие вопросы"; // группа по умолчанию

    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        const tagName = element.tagName.toLowerCase();
        const text = element.textContent.trim();

        if (!text && tagName !== 'img') continue;

        // Определяем заголовки групп
        if (tagName === 'p' && (element.innerHTML.includes('ТЕМА'))) {
            currentGroup = text;
            continue;
        }

        // Ищем начало вопроса
        if (tagName === 'p' && text && !text.match(/^[1-4][\.\)]\s/)) {
            if (currentQuestion && currentQuestion.options.length > 0) {
                questions.push(currentQuestion);
            }

            currentQuestion = {
                question: text,
                options: [],
                correctAnswer: null,
                image: null,
                group: currentGroup // сохраняем группу
            };

            const img = element.querySelector('img');
            if (img && img.src) {
                currentQuestion.image = img.src;
            }
        }
        // Ищем нумерованный список с вариантами ответов
        else if (tagName === 'ol' && currentQuestion) {
            const listItems = element.querySelectorAll('li');
            const options = [];
            let correctIndex = null;

            // Сначала собираем все варианты и находим правильный
            listItems.forEach((li, index) => {
                let optionText = li.textContent.trim();
                let isCorrect = false;
                let multiVals = null;


                if (optionText.includes('multi-')) {
                    const multiRes = optionText.split('multi-')[1].trim();

                    if (multiRes === "all") {
                        multiVals = ["all"];
                    } else {

                        multiVals = multiRes.match(/\d+/g); // Преобразуем в числа
                    }

                    optionText = optionText.split('multi')[0].trim();
                }

                // Проверяем правильный ответ (с |1 в конце)
                if (optionText.includes('|1')) {
                    optionText = optionText.split('|1')[0].trim();
                    //optionText = optionText.replace(/\|1.*$/, '').trim();
                    isCorrect = true;
                    correctIndex = index;
                }

                // Добавляем номер варианта к тексту
                //optionText = `${index + 1}. ${optionText}`;

                options.push({
                    text: optionText,
                    originalIndex: index,
                    isCorrect: isCorrect,
                    multiVals: multiVals
                });
            });


            // Перемешиваем варианты ответов
            const shuffledOptions = shuffleArray(options);
            //console.log(shuffledOptions);

            currentQuestion._originalOptions = options;

            // Разделяем варианты на три группы
            const normalOptions = [];
            const multiOptions = [];
            const allOptions = [];

            // Сначала распределяем варианты по группам
            shuffledOptions.forEach((option) => {
                if (option.multiVals != null) {
                    if (option.multiVals[0] === "all") {
                        allOptions.push(option);
                    } else {
                        multiOptions.push(option);
                    }
                } else {
                    normalOptions.push(option);
                }
            });

            // Собираем в правильном порядке: обычные -> multi -> all
            const finalOptions = [...normalOptions, ...multiOptions, ...allOptions];

            // Обрабатываем multiOptions и находим правильный ответ
            let newCorrectIndex = null;

            finalOptions.forEach((option, finalIndex) => {
                // Обрабатываем multi варианты (замена индексов)
                if (option.multiVals != null && option.multiVals[0] !== "all") {
                    const valsArr = option.multiVals[0].split("");

                    // Получаем все новые числа
                    const newNumbers = [];
                    valsArr.forEach(element => {
                        const originalElement = options[parseInt(element) - 1];
                        if (originalElement) {
                            const newPosition = finalOptions.findIndex(opt => opt === originalElement);
                            newNumbers.push(newPosition + 1);
                        }
                    });

                    // Сортируем числа по возрастанию
                    newNumbers.sort((a, b) => a - b);

                    // Находим все числа в тексте и заменяем их по порядку
                    let numbersInText = option.text.match(/\d+/g) || [];
                    if (numbersInText.length === newNumbers.length) {
                        let newText = option.text;
                        numbersInText.forEach((num, index) => {
                            newText = newText.replace(num, newNumbers[index].toString());
                        });
                        option.text = newText;
                    }
                }

                // Добавляем в вопрос
                currentQuestion.options.push(option.text);

                // Запоминаем индекс правильного ответа
                if (option.isCorrect) {
                    newCorrectIndex = finalIndex;
                }
            });

            // Сохраняем новый индекс правильного ответа
            if (newCorrectIndex !== null) {
                currentQuestion.correctAnswer = newCorrectIndex;
            }

            // Сохраняем оригинальные данные для отладки

            currentQuestion._originalCorrect = correctIndex;
            currentQuestion._shuffledCorrect = newCorrectIndex;
        }
        // Ищем отдельные изображения (могут быть между вопросом и списком)
        else if (tagName === 'img' && currentQuestion && currentQuestion.options.length === 0) {
            currentQuestion.image = element.src;
        }
        // Продолжение текста вопроса
        else if (tagName === 'p' && currentQuestion && currentQuestion.options.length === 0 && text) {
            currentQuestion.question += ' ' + text;
        }
    }

    // Добавляем последний вопрос
    if (currentQuestion && currentQuestion.options.length > 0) {
        questions.push(currentQuestion);
    }

    return questions;
}

function displayTest(questions) {
    const questionsContainer = document.getElementById('questions');
    const testContainer = document.getElementById('testContainer');

    questionsContainer.innerHTML = '';

    // Сохраняем все вопросы
    window.allQuestions = questions;

    // Показываем все вопросы по умолчанию
    window.currentQuestions = questions;

    questions.forEach((q, qIndex) => {
        qAmount += 1;
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question';
        questionDiv.id = `question-${qIndex}`;
        questionDiv.dataset.group = q.group; // сохраняем группу в data-атрибут

        let questionHTML = `
            <div class="question-header">
                <div class="question-number">${qIndex + 1}</div>
                <div class="question-text">${q.question}</div>
            </div>
        `;

        if (q.image) {
            questionHTML += `<img src="${q.image}" class="question-image" alt="Изображение к вопросу">`;
        }

        questionHTML += `<div class="options">`;

        q.options.forEach((option, oIndex) => {
            questionHTML += `
                <div class="option" onclick="selectOption(${qIndex}, ${oIndex})">
                    
                        <p id="q${qIndex}o${oIndex}">${oIndex + 1}. ${option}</p>
                    
                </div>
            `;
        });

        questionHTML += `</div>`;
        questionDiv.innerHTML = questionHTML;
        questionsContainer.appendChild(questionDiv);
    });

    testContainer.style.display = 'block';
    window.scrollTo(0, 0);

    const remainsP = document.getElementById('remainsAmount');
    remainsP.textContent = qAmount;
}

function selectOption(questionIndex, optionIndex, event) {
    if (event) event.stopPropagation();
    //const question = window.currentQuestions[questionIndex];
    checkAnswer(questionIndex, optionIndex);
    //question.userAnswer = optionIndex;
}

function checkAnswer(questionIndex, selectedOptionIndex) {
    const question = testData[questionIndex];
    const optionDiv = document.querySelector(`#q${questionIndex}o${selectedOptionIndex}`).closest('.option');
    const allOptions = document.querySelectorAll(`#question-${questionIndex} .option`);



    // Удаляем предыдущие сообщения
    const oldFeedback = optionDiv.nextElementSibling;
    if (oldFeedback && oldFeedback.classList.contains('result-feedback')) {
        oldFeedback.remove();
    }

    // Проверяем ответ
    const isCorrect = selectedOptionIndex === question.correctAnswer;

    // Применяем стили
    if (isCorrect) {
        //console.log(optionDiv.classList)
        if (!optionDiv.classList.contains('correct')) {
            if (optionDiv.parentElement.classList.contains('wasincorrect')) {
                optionDiv.parentElement.classList.remove('wasincorrect');
                updateTotalResult("--");
            }
            optionDiv.classList.add('correct');
            updateTotalResult("+");
            //console.log("+")
            optionDiv.parentElement.classList.add('wascorrect');
        }

    } else {
        const parent = optionDiv.parentElement;

        if (optionDiv.parentElement.classList.contains('wascorrect')) {
            optionDiv.parentElement.classList.remove('wascorrect');
            updateTotalResult("-+");
        }

        const children = Array.from(parent.children);

        // Проверить, есть ли у кого-то из детей класс 'incorrect'
        const hasIncorrectChild = children.some(child =>
            child.classList.contains('incorrect')
        );
        if (hasIncorrectChild) {
            optionDiv.classList.add('incorrect');
        }
        else if (!optionDiv.classList.contains('incorrect')) {
            optionDiv.classList.add('incorrect');
            updateTotalResult("-");
            //console.log("-")
        }

        parent.classList.add('wasincorrect')
    }

    // Сбрасываем стили всех вариантов
    allOptions.forEach(opt => {
        if (opt !== optionDiv) { // Не трогаем выбранный вариант
            opt.classList.remove('correct', 'incorrect');
        }
    });

}

function updateTotalResult(operation) {
    const remainsP = document.getElementById('remainsAmount');
    const correctP = document.getElementById('correctAmount');
    const incorrectP = document.getElementById('incorrectAmount');

    if (operation == "+") {
        correctP.textContent = Number(correctP.textContent) + 1;
        remainsP.textContent = Number(remainsP.textContent) - 1; // уменьшаем оставшиеся
    } else if (operation == "-") {
        incorrectP.textContent = Number(incorrectP.textContent) + 1;
        remainsP.textContent = Number(remainsP.textContent) - 1; // уменьшаем оставшиеся
    } else if (operation == "clear") {
        correctP.textContent = 0;
        incorrectP.textContent = 0;
        remainsP.textContent = qAmount;
    } else if (operation == "-+") {
        correctP.textContent = Number(correctP.textContent) - 1;
        remainsP.textContent = Number(remainsP.textContent) + 1;
    } else if (operation == "--") {
        incorrectP.textContent = Number(incorrectP.textContent) - 1;
        remainsP.textContent = Number(remainsP.textContent) + 1;
    }
}

function checkAllAnswers() {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '';

    let correctCount = 0;
    let totalCount = window.currentQuestions.length;

    window.currentQuestions.forEach((question, index) => {
        const isCorrect = question.userAnswer === question.correctAnswer;
        if (isCorrect) correctCount++;

        const resultDiv = document.createElement('div');
        resultDiv.className = `result-item ${isCorrect ? 'correct' : 'incorrect'}`;
        resultDiv.innerHTML = `
            <strong>Вопрос ${index + 1}:</strong> 
            ${isCorrect ? '✓ Правильно' : '✗ Неправильно'}
            ${!isCorrect ? ` (Правильный ответ: ${question.correctAnswer + 1})` : ''}
        `;
        resultsDiv.appendChild(resultDiv);
    });

    const scoreDiv = document.createElement('div');
    scoreDiv.className = 'score';
    scoreDiv.innerHTML = `<strong>Результат:</strong> ${correctCount} из ${totalCount}`;
    resultsDiv.appendChild(scoreDiv);

    resultsDiv.style.display = 'block';
}

function resetTest() {
    // Сбрасываем все выборы
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.checked = false;
    });

    // Сбрасываем стили
    document.querySelectorAll('.option').forEach(option => {
        option.classList.remove('correct', 'incorrect');
    });

    // Удаляем фидбэк
    document.querySelectorAll('.result-feedback').forEach(feedback => {
        feedback.remove();
    });

    document.querySelectorAll('.wascorrect').forEach(el => {
        el.classList.remove("wascorrect")
    })

    document.querySelectorAll('.wasincorrect').forEach(el => {
        el.classList.remove("wasincorrect")
    })

    // Сбрасываем общий результат
    updateTotalResult("clear");
}

// Функция для перемешивания массива (алгоритм Фишера-Йейтса)
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Добавляем newIndex каждому элементу
    shuffled.forEach((item, index) => {
        item.newIndex = index;
    });

    return shuffled;
}

function filterQuestionsByGroup(groupName) {
    const questionsContainer = document.getElementById('questions');
    const allQuestionDivs = questionsContainer.querySelectorAll('.question');

    allQuestionDivs.forEach(div => {
        if (groupName === 'all' || div.dataset.group === groupName) {
            div.style.display = 'block';
        } else {
            div.style.display = 'none';
        }
    });

    // Обновляем текущие вопросы для проверки ответов
    if (groupName === 'all') {
        window.currentQuestions = window.allQuestions;
    } else {
        window.currentQuestions = window.allQuestions.filter(q => q.group === groupName);
    }

    // Сбрасываем результаты
    //document.getElementById('results').style.display = 'none';
}

function displayGroupSelector() {
    const groupSelector = document.getElementById('groupSelector');
    const groupSelect = document.createElement('select');

    groupSelect.classList.add('mySelect');

    groupSelect.innerHTML = '<option value="all">Все вопросы</option>';

    // Получаем уникальные группы
    const groups = [...new Set(window.allQuestions.map(q => q.group))];

    const sorted = groups.sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)[0]);
        const numB = parseInt(b.match(/\d+/)[0]);
        return numA - numB;
    })

    sorted.forEach(group => {
        if (group) {
            groupSelect.innerHTML += `<option value="${group}">${group}</option>`;
        }
    });

    groupSelect.onchange = function () {
        filterQuestionsByGroup(this.value);
    };

    groupSelector.innerHTML = '';
    groupSelector.appendChild(groupSelect);
    groupSelector.style.display = 'block';
}

// Получаем кнопку
const scrollToTopBtn = document.getElementById('scrollToTopBtn');

// Показываем/скрываем кнопку при скролле
window.addEventListener('scroll', () => {
    if (window.pageYOffset > 300) {
        scrollToTopBtn.classList.add('show');
    } else {
        scrollToTopBtn.classList.remove('show');
    }
});

// Плавная прокрутка вверх при клике
scrollToTopBtn.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

// Запись файла
async function saveTextFileRobust(filename, content) {
    // Пробуем современный API
    if ('showSaveFilePicker' in window) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{
                    description: 'Text files',
                    accept: {'text/plain': ['.txt']},
                }],
            });
            
            // Новый экземпляр потока для каждой записи
            const writable = await handle.createWritable();
            
            // Запись и немедленное закрытие
            await writable.write(content);
            await writable.close();
            
            return true;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                return false; // Пользователь отменил
            }
            console.warn('File API failed, falling back to download', error);
        }
    }
    
    // Всегда работающий fallback
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
    
    return true;
}

// Чтение файла
async function readFile() {
    try {
        const [handle] = await window.showOpenFilePicker({
            types: [{
                description: 'Text files',
                accept: {'text/plain': ['.txt']},
            }],
        });
        
        const file = await handle.getFile();
        const content = await file.text();
        console.log('Содержимое:', content);
    } catch (err) {
        console.error('Ошибка:', err);
    }
}